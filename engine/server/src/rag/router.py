"""
RAG router.

API endpoints for RAG operations including collection management,
document upload with processing, and semantic search.
"""

import logging
import os
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from sqlalchemy import update

from src.auth import CurrentUser, CurrentUserGroups, UserRole
from src.embedding.resolver import get_knowledge_embedding_provider
from src.infra.config import get_settings
from src.infra.database import DbSession

from .models import DocumentStatus, RAGCollection, RAGDocument, RAGScope
from .processor import MAX_FILE_SIZE, SUPPORTED_EXTENSIONS
from .repository import RAGRepository
from .schemas import (
    ChunkResponse,
    CollectionCreate,
    CollectionListResponse,
    CollectionResponse,
    DocumentListResponse,
    DocumentResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])
settings = get_settings()


# ─── Collection Endpoints ──────────────────────────────────────────────────────


@router.get("/collections", response_model=CollectionListResponse)
async def list_collections(
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> CollectionListResponse:
    """List RAG collections accessible to the current user."""
    repo = RAGRepository(db)
    collections = await repo.list_collections_for_user(user.id, user_groups)

    return CollectionListResponse(
        items=[CollectionResponse.model_validate(c) for c in collections],
        total=len(collections),
    )


@router.post("/collections", response_model=CollectionResponse, status_code=201)
async def create_collection(
    data: CollectionCreate,
    user: CurrentUser,
    db: DbSession,
) -> CollectionResponse:
    """Create a new RAG collection.

    Scope rules:
    - GLOBAL: admin/operator only
    - GROUP: requires allowed_groups
    - USER: defaults owner_user_id to current user if not set
    """
    if data.scope == RAGScope.GLOBAL and user.role.level < UserRole.ADMIN.level:
        raise HTTPException(
            status_code=403,
            detail="Only admin or owner can create GLOBAL collections",
        )

    if data.scope == RAGScope.GROUP and not data.allowed_groups:
        raise HTTPException(
            status_code=400,
            detail="allowed_groups is required for GROUP-scoped collections",
        )

    owner_user_id = data.owner_user_id
    if data.scope == RAGScope.AGENT and not owner_user_id:
        owner_user_id = user.id

    collection = RAGCollection(
        id=str(uuid4()),
        name=data.name,
        description=data.description,
        scope=data.scope,
        allowed_groups=data.allowed_groups,
        owner_user_id=owner_user_id,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)

    return CollectionResponse.model_validate(collection)


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> CollectionResponse:
    """Get a specific collection (only if user has access)."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)

    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Single-query access check (avoids fetching all collections)
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Collection not found")

    return CollectionResponse.model_validate(collection)


@router.delete("/collections/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> None:
    """Delete a collection and all its documents/chunks."""
    repo = RAGRepository(db)
    collection = await repo.get_collection(collection_id)

    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Collection not found")

    await db.delete(collection)
    await db.commit()

    # Best-effort Qdrant cleanup
    try:
        from .vector_store import QdrantRAGVectorStore
        vs = QdrantRAGVectorStore()
        await vs.delete_by_collection(collection_id)
    except Exception as e:
        logger.error("Qdrant cleanup failed for collection %s: %s", collection_id, e)


# ─── Document Endpoints ───────────────────────────────────────────────────────


@router.get("/collections/{collection_id}/documents", response_model=DocumentListResponse)
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
        raise HTTPException(status_code=404, detail="Collection not found")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Collection not found")

    documents = await repo.list_documents(collection_id)

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in documents],
        total=len(documents),
    )


@router.post(
    "/collections/{collection_id}/documents/upload",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload_document_endpoint(
    collection_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
    file: UploadFile = File(...),
) -> DocumentResponse:
    """Upload and process a document into a RAG collection.

    Supported formats: PDF, DOCX, TXT, MD
    Max file size: 50MB
    """
    repo = RAGRepository(db)

    # Verify collection exists and user has access
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Collection not found")

    # Validate file
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # Stream file to a temp file to avoid holding large uploads in RAM.
    # The temp file is read by the worker and cleaned up after.
    import tempfile

    upload_dir = os.path.join(settings.CONFIG_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    total_size = 0
    tmp_fd, tmp_path = tempfile.mkstemp(dir=upload_dir, suffix=ext)
    try:
        while chunk := await file.read(64 * 1024):  # 64KB chunks
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                os.close(tmp_fd)
                os.unlink(tmp_path)
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large (max {MAX_FILE_SIZE // (1024 * 1024)}MB)",
                )
            os.write(tmp_fd, chunk)
        os.close(tmp_fd)
    except HTTPException:
        raise
    except Exception:
        try:
            os.close(tmp_fd)
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    # Create document record with PROCESSING status
    doc_id = str(uuid4())
    document = RAGDocument(
        id=doc_id,
        collection_id=collection_id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=total_size,
        status=DocumentStatus.PROCESSING.value,
        meta={"file_path": tmp_path},
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Dispatch processing via Redis Streams.
    # Pass file path instead of base64 to avoid doubling memory usage
    # for large files. Worker reads file and cleans up when done.
    chunk_size = getattr(collection, "chunk_size", 500) or 500
    chunk_overlap = getattr(collection, "chunk_overlap", 50) or 50

    from src.infra.publish import get_event_bus
    bus = await get_event_bus()
    await bus.publish("tasks:documents", {
        "collection_id": str(collection_id),
        "document_id": str(doc_id),
        "file_path": tmp_path,
        "filename": filename,
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
    })

    logger.info("Document %s (%s) queued for processing", filename, doc_id)

    return DocumentResponse.model_validate(document)


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> DocumentResponse:
    """Get a specific document (only if user has access to its collection)."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user has access to the parent collection (IDOR prevention)
    if not await repo.can_access_collection(document.collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse.model_validate(document)


@router.delete("/collections/{collection_id}/documents/{document_id}", status_code=204)
async def delete_document(
    collection_id: str,
    document_id: str,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
) -> None:
    """Delete a document and its chunks."""
    repo = RAGRepository(db)
    document = await repo.get_document(document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.collection_id != collection_id:
        raise HTTPException(status_code=404, detail="Document not found in this collection")

    # Verify collection access
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise HTTPException(status_code=404, detail="Collection not found")

    doc_chunk_count = document.chunk_count
    await db.delete(document)

    # Update collection counts
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

    # Best-effort Qdrant cleanup
    try:
        from .vector_store import QdrantRAGVectorStore
        vs = QdrantRAGVectorStore()
        await vs.delete_by_document(document_id)
    except Exception as e:
        logger.error("Qdrant cleanup failed for document %s: %s", document_id, e)


# ─── Search Endpoint ───────────────────────────────────────────────────────────


@router.post("/search", response_model=SearchResponse)
async def search_rag(
    request: SearchRequest,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
    response: Response = None,
) -> SearchResponse:
    """Search RAG collections via hybrid search (dense + BM25, scoped to user access)."""
    repo = RAGRepository(db)

    # Check embedding cache for query embedding
    from src.rag.embedding_cache import embedding_cache

    query_embedding = await embedding_cache.get(request.query)
    if query_embedding is None:
        embedding_provider = get_knowledge_embedding_provider()
        try:
            query_embedding = await embedding_provider.embed_text(request.query)
            await embedding_cache.set(request.query, query_embedding)
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Embedding service unavailable: {e}",
            )

    # Instantiate reranker from settings
    from src.rag.reranker import RerankerFactory

    reranker = RerankerFactory.get_reranker(settings)
    rerank_enabled = settings.RERANK_PROVIDER.lower() not in ("none", "")

    results = await repo.search_hybrid(
        query_embedding=query_embedding,
        query_text=request.query,
        user_id=user.id,
        user_groups=user_groups,
        collection_ids=request.collection_ids,
        limit=request.limit,
        threshold=request.threshold,
        reranker=reranker if rerank_enabled else None,
    )

    # Check if Qdrant was degraded during search
    degraded = repo._vector_store.last_search_degraded
    if degraded and response:
        response.headers["X-Search-Degraded"] = "true"

    return SearchResponse(
        results=[
            SearchResultItem(
                chunk=ChunkResponse(
                    id=r.chunk_id,
                    document_id=r.document_id,
                    collection_id=r.collection_id,
                    content=r.content,
                    chunk_index=r.chunk_index,
                ),
                score=r.score,
                document_filename=r.document.filename if r.document else None,
            )
            for r in results
        ],
        total=len(results),
        reranked=rerank_enabled,
        warning="Vector search unavailable, results may be incomplete" if degraded else None,
    )


@router.get("/supported-formats")
async def get_supported_formats() -> dict:
    """Get supported file formats for document upload."""
    return {
        "formats": sorted(SUPPORTED_EXTENSIONS),
        "max_size_bytes": MAX_FILE_SIZE,
    }
