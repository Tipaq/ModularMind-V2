"""RAG document endpoints — upload, download, reprocess, delete."""

import logging
import os
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import update

from src.auth import CurrentUser, CurrentUserGroups
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import DocumentStatus, RAGCollection, RAGDocument
from .processor import MAX_FILE_SIZE, SUPPORTED_EXTENSIONS
from .repository import RAGRepository
from .schemas import DocumentListResponse, DocumentResponse

logger = logging.getLogger(__name__)
settings = get_settings()

document_router = APIRouter(prefix="/rag", tags=["RAG Documents"])


@document_router.get(
    "/collections/{collection_id}/documents", response_model=DocumentListResponse
)
async def list_documents(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> DocumentListResponse:
    """List documents in a collection."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise_not_found("Collection")
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    documents = await repo.list_documents(collection_id)
    return DocumentListResponse(
        items=[DocumentResponse.from_document(d) for d in documents],
        total=len(documents),
    )


@document_router.post(
    "/collections/{collection_id}/documents/upload",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload_document_endpoint(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
    file: UploadFile = File(...),  # noqa: B008
) -> DocumentResponse:
    """Upload and process a document into a RAG collection."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise_not_found("Collection")
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            ),
        )

    file_bytes = await _read_file_capped(file)
    doc_id = str(uuid4())
    object_key = f"rag/{collection_id}/{doc_id}/{filename}"

    from src.infra.object_store import get_object_store

    store = get_object_store()
    await store.upload(
        bucket=settings.S3_BUCKET_RAG,
        key=object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    document = RAGDocument(
        id=doc_id,
        collection_id=collection_id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=len(file_bytes),
        status=DocumentStatus.PROCESSING.value,
        meta={"object_key": object_key},
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    await _dispatch_document_processing(collection, doc_id, object_key, filename)
    logger.info("Document %s (%s) queued for processing", filename, doc_id)
    return DocumentResponse.from_document(document)


@document_router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> DocumentResponse:
    """Get a specific document."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)
    if not document:
        raise_not_found("Document")
    if not await repo.can_access_collection(document.collection_id, user.id, user_groups):
        raise_not_found("Document")
    return DocumentResponse.from_document(document)


@document_router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> StreamingResponse:
    """Download the original document file from object storage."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)
    if not document:
        raise_not_found("Document")
    if not await repo.can_access_collection(document.collection_id, user.id, user_groups):
        raise_not_found("Document")

    object_key = (document.meta or {}).get("object_key")
    if not object_key:
        raise HTTPException(
            status_code=404,
            detail="Original file not available (uploaded before object storage)",
        )

    from src.infra.object_store import get_object_store

    store = get_object_store()
    content_type = document.content_type or "application/octet-stream"
    safe_filename = document.filename.replace('"', '\\"')

    async def stream():
        async for chunk in store.download_stream(settings.S3_BUCKET_RAG, object_key):
            yield chunk

    return StreamingResponse(
        stream(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@document_router.post(
    "/documents/{document_id}/reprocess", response_model=DocumentResponse, status_code=202
)
async def reprocess_document(
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> DocumentResponse:
    """Re-process a document (re-chunk + re-embed from persisted original file)."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)
    if not document:
        raise_not_found("Document")
    if not await repo.can_access_collection(document.collection_id, user.id, user_groups):
        raise_not_found("Document")

    object_key = (document.meta or {}).get("object_key")
    if not object_key:
        raise HTTPException(
            status_code=409, detail="Original file not available — cannot reprocess"
        )

    try:
        from .vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_document(document_id)
    except (ConnectionError, OSError, RuntimeError) as exc:
        logger.warning("Qdrant chunk cleanup for reprocess of %s: %s", document_id, exc)

    collection = await repo.get_collection(document.collection_id)
    old_chunk_count = document.chunk_count

    from sqlalchemy import delete as sa_delete

    from .models import RAGChunk

    await db.execute(sa_delete(RAGChunk).where(RAGChunk.document_id == document_id))

    await db.execute(
        update(RAGDocument)
        .where(RAGDocument.id == document_id)
        .values(status=DocumentStatus.PROCESSING.value, chunk_count=0, error_message=None)
    )

    if collection and old_chunk_count > 0:
        await db.execute(
            update(RAGCollection)
            .where(RAGCollection.id == document.collection_id)
            .values(chunk_count=max(0, collection.chunk_count - old_chunk_count))
        )

    await db.commit()
    await db.refresh(document)

    await _dispatch_document_processing(collection, document_id, object_key, document.filename)
    logger.info("Document %s queued for reprocessing", document_id)
    return DocumentResponse.from_document(document)


@document_router.delete("/collections/{collection_id}/documents/{document_id}", status_code=204)
async def delete_document(
    collection_id: str,
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> None:
    """Delete a document, its chunks, Qdrant vectors, and MinIO file."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)
    if not document:
        raise_not_found("Document")
    if document.collection_id != collection_id:
        raise_not_found("Document")
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    doc_chunk_count = document.chunk_count

    object_key = (document.meta or {}).get("object_key")
    if object_key:
        try:
            from src.infra.object_store import get_object_store

            store = get_object_store()
            await store.delete(settings.S3_BUCKET_RAG, object_key)
        except (OSError, ConnectionError) as exc:
            logger.warning("MinIO cleanup failed for document %s: %s", document_id, exc)

    await db.delete(document)

    collection = await repo.get_collection(collection_id)
    if collection:
        await db.execute(
            update(RAGCollection)
            .where(RAGCollection.id == collection_id)
            .values(
                document_count=max(0, collection.document_count - 1),
                chunk_count=max(0, collection.chunk_count - doc_chunk_count),
            )
        )

    await db.commit()

    try:
        from .vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_document(document_id)
    except (ConnectionError, OSError, RuntimeError) as exc:
        logger.error("Qdrant cleanup failed for document %s: %s", document_id, exc)


async def _read_file_capped(file: UploadFile) -> bytes:
    """Read upload file content, raising 413 if exceeds MAX_FILE_SIZE."""
    chunks: list[bytes] = []
    total_size = 0
    while chunk := await file.read(64 * 1024):
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {MAX_FILE_SIZE // (1024 * 1024)}MB)",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def _dispatch_document_processing(
    collection: RAGCollection | None,
    document_id: str,
    object_key: str,
    filename: str,
) -> None:
    """Publish document processing task to Redis Streams."""
    chunk_size = getattr(collection, "chunk_size", 500) or 500
    chunk_overlap = getattr(collection, "chunk_overlap", 50) or 50

    from src.infra.publish import get_event_bus

    bus = await get_event_bus()
    await bus.publish(
        "tasks:documents",
        {
            "collection_id": str(collection.id) if collection else "",
            "document_id": str(document_id),
            "object_key": object_key,
            "filename": filename,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
        },
    )
