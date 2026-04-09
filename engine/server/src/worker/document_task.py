from __future__ import annotations

import logging
from typing import Any

import sqlalchemy.exc

logger = logging.getLogger(__name__)


async def document_process_handler(data: dict[str, Any]) -> None:
    """Process an uploaded document into chunks and embeddings.

    Receives data from tasks:documents stream:
    - collection_id: str
    - document_id: str
    - object_key: str  (S3 key in MinIO)
    - filename: str
    - chunk_size: int
    - chunk_overlap: int
    """
    from sqlalchemy import update

    from src.infra.database import async_session_maker
    from src.rag.models import DocumentStatus, RAGDocument
    from src.rag.processor import process_document

    collection_id = data.get("collection_id", "")
    document_id = data.get("document_id", "")
    object_key = data.get("object_key", "")
    filename = data.get("filename", "")
    chunk_size = int(data.get("chunk_size", 500))
    chunk_overlap = int(data.get("chunk_overlap", 50))

    if not all([collection_id, document_id, object_key, filename]):
        logger.error("document_process_handler: missing required fields in %s", data)
        return

    logger.info("Processing document %s (%s)", filename, document_id)

    async with async_session_maker() as session:
        try:
            from src.infra.config import get_settings
            from src.infra.object_store import get_object_store

            store = get_object_store()
            s = get_settings()
            file_content = await store.download(s.S3_BUCKET_RAG, object_key)

            chunk_count = await process_document(
                document_id=document_id,
                collection_id=collection_id,
                file_content=file_content,
                filename=filename,
                db_session=session,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

            await session.execute(
                update(RAGDocument)
                .where(RAGDocument.id == document_id)
                .values(status=DocumentStatus.READY.value)
            )
            await session.commit()
            logger.info("Document %s processed: %d chunks", document_id, chunk_count)

            # File stays in MinIO — no deletion (persistent storage)

        except (
            RuntimeError,
            ValueError,
            KeyError,
            TypeError,
            OSError,
            ConnectionError,
            TimeoutError,
            sqlalchemy.exc.SQLAlchemyError,
        ) as exc:
            logger.exception("Failed to process document %s", document_id)
            try:
                await session.execute(
                    update(RAGDocument)
                    .where(RAGDocument.id == document_id)
                    .values(
                        status=DocumentStatus.FAILED.value,
                        error_message=str(exc)[:500],
                    )
                )
                await session.commit()
            except (OSError, sqlalchemy.exc.SQLAlchemyError):
                logger.exception("Failed to update document %s status to FAILED", document_id)
            raise  # Re-raise to trigger retry/DLQ
