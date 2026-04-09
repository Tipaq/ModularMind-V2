"""RAG search endpoints."""

import logging

from fastapi import APIRouter, HTTPException, Response

from src.auth import CurrentUser, CurrentUserGroups
from src.embedding.resolver import get_knowledge_embedding_provider
from src.infra.config import get_settings
from src.infra.database import DbSession

from .processor import MAX_FILE_SIZE, SUPPORTED_EXTENSIONS
from .repository import RAGRepository
from .schemas import (
    ChunkResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)

logger = logging.getLogger(__name__)
settings = get_settings()

search_router = APIRouter(prefix="/rag", tags=["RAG Search"])


@search_router.post("/search", response_model=SearchResponse)
async def search_rag(
    request: SearchRequest,
    user: CurrentUser,
    user_groups: CurrentUserGroups,
    db: DbSession,
    response: Response = None,
) -> SearchResponse:
    """Search RAG collections via hybrid search (dense + BM25, scoped to user access)."""
    repo = RAGRepository(db)

    from src.rag.embedding_cache import embedding_cache

    query_embedding = await embedding_cache.get(request.query)
    if query_embedding is None:
        embedding_provider = get_knowledge_embedding_provider()
        try:
            query_embedding = await embedding_provider.embed_text(request.query)
            await embedding_cache.set(request.query, query_embedding)
        except (ConnectionError, OSError, RuntimeError, ValueError) as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Embedding service unavailable: {exc}",
            ) from exc

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


@search_router.get("/supported-formats")
async def get_supported_formats() -> dict:
    """Get supported file formats for document upload."""
    return {
        "formats": sorted(SUPPORTED_EXTENSIONS),
        "max_size_bytes": MAX_FILE_SIZE,
    }
