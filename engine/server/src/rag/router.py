"""
RAG router.

API endpoints for RAG operations including collection management,
document upload with processing, and semantic search.
"""

import logging
import os
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update

from src.auth import CurrentUser, CurrentUserGroups, RequireAdmin, UserRole
from src.embedding.resolver import get_knowledge_embedding_provider
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

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
    ExplorerChunkListResponse,
    ExplorerChunkResponse,
    KnowledgeGlobalStatsResponse,
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])
settings = get_settings()


# ─── Admin Endpoints ──────────────────────────────────────────────────────────
# IMPORTANT: These must be defined BEFORE parameterized routes.


@router.get(
    "/admin/stats/global",
    response_model=KnowledgeGlobalStatsResponse,
    dependencies=[RequireAdmin],
)
async def get_knowledge_global_stats(db: DbSession) -> KnowledgeGlobalStatsResponse:
    """Get aggregate knowledge stats across all collections (admin only)."""
    from .models import RAGChunk, RAGCollection, RAGDocument

    # Single aggregate query
    col_count = await db.execute(select(func.count(RAGCollection.id)))
    doc_count = await db.execute(select(func.count(RAGDocument.id)))

    chunk_agg = await db.execute(
        select(
            func.count(RAGChunk.id).label("total"),
            func.coalesce(func.sum(RAGChunk.access_count), 0).label("accesses"),
        )
    )
    chunk_row = chunk_agg.one()

    # Documents by status
    status_result = await db.execute(
        select(RAGDocument.status, func.count(RAGDocument.id)).group_by(RAGDocument.status)
    )
    docs_by_status = {row[0]: row[1] for row in status_result.all()}

    # Collections by scope
    scope_result = await db.execute(
        select(RAGCollection.scope, func.count(RAGCollection.id)).group_by(RAGCollection.scope)
    )
    cols_by_scope = {
        row[0].value if hasattr(row[0], "value") else str(row[0]): row[1]
        for row in scope_result.all()
    }

    return KnowledgeGlobalStatsResponse(
        total_collections=col_count.scalar() or 0,
        total_documents=doc_count.scalar() or 0,
        total_chunks=int(chunk_row.total or 0),
        total_accesses=int(chunk_row.accesses or 0),
        documents_by_status=docs_by_status,
        collections_by_scope=cols_by_scope,
    )


@router.get(
    "/admin/explore",
    response_model=ExplorerChunkListResponse,
    dependencies=[RequireAdmin],
)
async def explore_knowledge(
    db: DbSession,
    collection_id: str | None = Query(default=None),
    document_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ExplorerChunkListResponse:
    """Paginated chunk browser with filters (admin only)."""
    from .models import RAGChunk, RAGCollection, RAGDocument

    base = (
        select(
            RAGChunk,
            RAGCollection.name.label("collection_name"),
            RAGDocument.filename.label("document_filename"),
        )
        .join(RAGDocument, RAGChunk.document_id == RAGDocument.id)
        .join(RAGCollection, RAGChunk.collection_id == RAGCollection.id)
    )
    count_base = select(func.count(RAGChunk.id))

    filters = []
    if collection_id:
        filters.append(RAGChunk.collection_id == collection_id)
    if document_id:
        filters.append(RAGChunk.document_id == document_id)

    if filters:
        base = base.where(*filters)
        count_base = count_base.where(*filters)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    rows = await db.execute(
        base.order_by(RAGChunk.created_at.desc()).offset(offset).limit(page_size)
    )

    items = [
        ExplorerChunkResponse(
            id=chunk.id,
            content=chunk.content[:500],
            chunk_index=chunk.chunk_index,
            collection_id=chunk.collection_id,
            collection_name=col_name,
            document_id=chunk.document_id,
            document_filename=doc_filename,
            access_count=chunk.access_count,
            last_accessed=chunk.last_accessed,
            created_at=chunk.created_at,
        )
        for chunk, col_name, doc_filename in rows.all()
    ]

    return ExplorerChunkListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/admin/graph",
    response_model=KnowledgeGraphResponse,
    dependencies=[RequireAdmin],
)
async def get_knowledge_graph(
    db: DbSession,
    limit: int = Query(default=200, ge=1, le=1000),
) -> KnowledgeGraphResponse:
    """Get knowledge graph data at document level (admin only)."""
    from .models import RAGCollection, RAGDocument

    # Collection nodes
    collections = await db.execute(select(RAGCollection).order_by(RAGCollection.name).limit(limit))
    col_list = list(collections.scalars().all())

    nodes: list[KnowledgeGraphNode] = []
    edges: list[KnowledgeGraphEdge] = []

    col_ids = set()
    for c in col_list:
        col_ids.add(c.id)
        nodes.append(
            KnowledgeGraphNode(
                id=f"col:{c.id}",
                label=c.name,
                node_type="collection",
                scope=c.scope.value if hasattr(c.scope, "value") else str(c.scope),
                chunk_count=c.chunk_count,
                size=max(8, min(30, 8 + c.document_count * 2)),
            )
        )

    # Document nodes (top N by chunk_count for performance)
    if col_ids:
        docs = await db.execute(
            select(RAGDocument)
            .where(RAGDocument.collection_id.in_(col_ids))
            .order_by(RAGDocument.chunk_count.desc())
            .limit(limit)
        )
        for d in docs.scalars().all():
            nodes.append(
                KnowledgeGraphNode(
                    id=f"doc:{d.id}",
                    label=d.filename,
                    node_type="document",
                    status=d.status,
                    chunk_count=d.chunk_count,
                    size=max(4, min(20, 4 + d.chunk_count)),
                )
            )
            edges.append(
                KnowledgeGraphEdge(
                    source=f"col:{d.collection_id}",
                    target=f"doc:{d.id}",
                    weight=max(0.5, min(3.0, d.chunk_count / 10)),
                )
            )

    return KnowledgeGraphResponse(nodes=nodes, edges=edges)


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
        raise_not_found("Collection")

    # Single-query access check (avoids fetching all collections)
    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

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
        raise_not_found("Collection")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    await db.delete(collection)
    await db.commit()

    # Best-effort Qdrant cleanup
    try:
        from .vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_collection(collection_id)
    except Exception as e:  # Qdrant client can raise various errors
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
        raise_not_found("Collection")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    documents = await repo.list_documents(collection_id)

    return DocumentListResponse(
        items=[DocumentResponse.from_document(d) for d in documents],
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
    file: UploadFile = File(...),  # noqa: B008
) -> DocumentResponse:
    """Upload and process a document into a RAG collection.

    Supported formats: PDF, DOCX, TXT, MD
    Max file size: 50MB
    """
    repo = RAGRepository(db)

    # Verify collection exists and user has access
    collection = await repo.get_collection(collection_id)
    if not collection:
        raise_not_found("Collection")

    if not await repo.can_access_collection(collection_id, user.id, user_groups):
        raise_not_found("Collection")

    # Validate file
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

    # Stream file into memory buffer (capped at MAX_FILE_SIZE), then upload to MinIO
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

    file_bytes = b"".join(chunks)

    # Upload original file to MinIO for persistent storage
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

    # Create document record with PROCESSING status
    document = RAGDocument(
        id=doc_id,
        collection_id=collection_id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=total_size,
        status=DocumentStatus.PROCESSING.value,
        meta={"object_key": object_key},
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Dispatch processing via Redis Streams
    chunk_size = getattr(collection, "chunk_size", 500) or 500
    chunk_overlap = getattr(collection, "chunk_overlap", 50) or 50

    from src.infra.publish import get_event_bus

    bus = await get_event_bus()
    await bus.publish(
        "tasks:documents",
        {
            "collection_id": str(collection_id),
            "document_id": str(doc_id),
            "object_key": object_key,
            "filename": filename,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
        },
    )

    logger.info("Document %s (%s) queued for processing", filename, doc_id)

    return DocumentResponse.from_document(document)


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
        raise_not_found("Document")

    # Verify user has access to the parent collection (IDOR prevention)
    if not await repo.can_access_collection(document.collection_id, user.id, user_groups):
        raise_not_found("Document")

    return DocumentResponse.from_document(document)


@router.get("/documents/{document_id}/download")
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
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
        },
    )


@router.post("/documents/{document_id}/reprocess", response_model=DocumentResponse, status_code=202)
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
            status_code=409,
            detail="Original file not available — cannot reprocess",
        )

    # Delete existing chunks (Qdrant + DB)
    try:
        from .vector_store import QdrantRAGVectorStore

        vs = QdrantRAGVectorStore()
        await vs.delete_by_document(document_id)
    except Exception as e:  # Qdrant client can raise various errors
        logger.warning("Qdrant chunk cleanup for reprocess of %s: %s", document_id, e)

    # Update collection chunk_count before resetting document
    collection = await repo.get_collection(document.collection_id)
    old_chunk_count = document.chunk_count

    from sqlalchemy import delete as sa_delete

    from .models import RAGChunk

    await db.execute(sa_delete(RAGChunk).where(RAGChunk.document_id == document_id))

    # Reset document status
    await db.execute(
        update(RAGDocument)
        .where(RAGDocument.id == document_id)
        .values(
            status=DocumentStatus.PROCESSING.value,
            chunk_count=0,
            error_message=None,
        )
    )

    if collection and old_chunk_count > 0:
        await db.execute(
            update(RAGCollection)
            .where(RAGCollection.id == document.collection_id)
            .values(chunk_count=max(0, collection.chunk_count - old_chunk_count))
        )

    await db.commit()
    await db.refresh(document)

    # Re-dispatch to worker
    chunk_size = collection.chunk_size if collection else 500
    chunk_overlap = collection.chunk_overlap if collection else 50

    from src.infra.publish import get_event_bus

    bus = await get_event_bus()
    await bus.publish(
        "tasks:documents",
        {
            "collection_id": document.collection_id,
            "document_id": document_id,
            "object_key": object_key,
            "filename": document.filename,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
        },
    )

    logger.info("Document %s queued for reprocessing", document_id)
    return DocumentResponse.from_document(document)


@router.delete("/collections/{collection_id}/documents/{document_id}", status_code=204)
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

    # Best-effort MinIO cleanup
    object_key = (document.meta or {}).get("object_key")
    if object_key:
        try:
            from src.infra.object_store import get_object_store

            store = get_object_store()
            await store.delete(settings.S3_BUCKET_RAG, object_key)
        except Exception as e:  # S3/MinIO client can raise various errors
            logger.warning("MinIO cleanup failed for document %s: %s", document_id, e)

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
    except Exception as e:  # Qdrant client can raise various errors
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
        except Exception as e:  # LLM providers raise heterogeneous errors
            raise HTTPException(
                status_code=503,
                detail=f"Embedding service unavailable: {e}",
            ) from e

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
    degraded = repo.vector_store.last_search_degraded
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
