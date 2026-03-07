"""RAG document extractor handler (Stage 1).

Reads a document from object storage, extracts text, chunks it, and creates
RAGChunk records in PG. Publishes chunk IDs to `rag:extracted` for the
embedder stage.

Stream: tasks:documents -> extractor -> rag:extracted
"""

import logging
from uuid import uuid4

from sqlalchemy import func, select

from src.infra.config import get_settings
from src.infra.database import async_session_maker
from src.rag.models import RAGChunk, RAGCollection, RAGDocument, DocumentStatus

logger = logging.getLogger(__name__)


async def document_extract_handler(data: dict) -> None:
    """Extract text and create chunks for a document."""
    document_id = data.get("document_id", "")
    collection_id = data.get("collection_id", "")
    object_key = data.get("object_key", "")
    filename = data.get("filename", "")

    if not document_id or not collection_id:
        logger.error("Extractor: missing document_id or collection_id")
        return

    settings = get_settings()

    async with async_session_maker() as session:
        # Idempotency: skip if chunks already exist for this document
        existing = await session.execute(
            select(func.count(RAGChunk.id)).where(RAGChunk.document_id == document_id)
        )
        if (existing.scalar() or 0) > 0:
            logger.info("Extractor: chunks already exist for document %s, skipping", document_id)
            return

        # Download file from object store
        from src.infra.object_store import get_object_store

        store = get_object_store()
        file_content = await store.get(settings.S3_BUCKET_DOCUMENTS, object_key)
        if not file_content:
            logger.error("Extractor: file not found at %s", object_key)
            await _mark_failed(session, document_id, "File not found in object store")
            return

        # Extract text
        from src.rag.processor import extract_text

        try:
            text = await extract_text(file_content, filename)
        except Exception as e:
            logger.error("Extractor: text extraction failed for %s: %s", filename, e)
            await _mark_failed(session, document_id, f"Text extraction failed: {e}")
            return

        if not text.strip():
            await _mark_failed(session, document_id, "No text content extracted")
            return

        # Get collection chunk settings
        coll_result = await session.execute(
            select(RAGCollection).where(RAGCollection.id == collection_id)
        )
        collection = coll_result.scalar_one_or_none()
        chunk_size = collection.chunk_size if collection else 500
        chunk_overlap = collection.chunk_overlap if collection else 50
        coll_meta = collection.meta if collection else {}
        chunk_strategy = coll_meta.get("chunk_strategy", "token_aware") if isinstance(coll_meta, dict) else "token_aware"

        # Chunk text
        from src.rag.chunker import ChunkerFactory
        from src.rag.processor import TextChunker

        try:
            chunker = ChunkerFactory.get_chunker(
                chunk_strategy,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                chunk_size_tokens=chunk_size // 2,
                overlap_tokens=chunk_overlap // 2,
            )
        except (ValueError, TypeError):
            chunker = TextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        chunks = chunker.split(text)
        if not chunks:
            await _mark_failed(session, document_id, "No chunks produced after splitting")
            return

        # Create RAGChunk records
        chunk_ids = []
        for chunk in chunks:
            chunk_id = str(uuid4())
            chunk_ids.append(chunk_id)
            db_chunk = RAGChunk(
                id=chunk_id,
                document_id=document_id,
                collection_id=collection_id,
                content=chunk.content,
                chunk_index=chunk.position,
                meta=getattr(chunk, "metadata", {}),
            )
            session.add(db_chunk)

        # Update document status to PROCESSING
        doc = await session.get(RAGDocument, document_id)
        if doc:
            doc.status = DocumentStatus.PROCESSING.value

        await session.commit()

        logger.info(
            "Extractor: created %d chunks for document %s",
            len(chunk_ids), document_id,
        )

    # Publish to next stage
    from src.infra.redis_streams import RedisStreamBus

    import redis.asyncio as aioredis
    from src.infra.redis import get_redis_pool

    bus = RedisStreamBus(aioredis.Redis(connection_pool=get_redis_pool()))
    await bus.publish("rag:extracted", {
        "document_id": document_id,
        "collection_id": collection_id,
        "chunk_ids": ",".join(chunk_ids),  # CSV for Redis string encoding
    })


async def _mark_failed(session, document_id: str, error: str) -> None:
    """Mark a document as failed."""
    doc = await session.get(RAGDocument, document_id)
    if doc:
        doc.status = DocumentStatus.FAILED.value
        doc.error_message = error
    await session.commit()
