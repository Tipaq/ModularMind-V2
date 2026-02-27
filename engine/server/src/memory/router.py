"""
Memory router.

API endpoints for memory operations.
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from src.embedding import get_embedding_provider

from src.auth import CurrentUser
from src.infra.config import get_settings
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH
from src.infra.schemas import PaginatedResponse
from src.infra.database import DbSession

from .models import MemoryScope, MemoryTier
from .repository import MemoryRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["Memory"])
settings = get_settings()


class MemoryEntryResponse(BaseModel):
    """Memory entry response."""

    id: str
    scope: MemoryScope
    scope_id: str
    tier: MemoryTier
    content: str
    importance: float
    access_count: int
    last_accessed: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemoryListResponse(PaginatedResponse[MemoryEntryResponse]):
    """Memory list response."""


class MemorySearchRequest(BaseModel):
    """Memory search request."""

    query: str = Field(min_length=1, max_length=1000)
    scope: MemoryScope
    scope_id: str
    limit: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.7, ge=0, le=1)


class MemorySearchResult(BaseModel):
    """Memory search result."""

    entry: MemoryEntryResponse
    score: float


class MemorySearchResponse(BaseModel):
    """Memory search response."""

    results: list[MemorySearchResult]
    query_embedding_cached: bool = False
    warning: str | None = None


class MemoryStatsResponse(BaseModel):
    """Memory stats response."""

    total_entries: int
    entries_by_tier: dict[str, int]
    oldest_entry: datetime | None
    newest_entry: datetime | None


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    user: CurrentUser,
    db: DbSession,
    scope: MemoryScope = Query(...),
    scope_id: str = Query(...),
    tier: MemoryTier | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> MemoryListResponse:
    """List memory entries for a scope."""
    repo = MemoryRepository(db)

    # Use SQL OFFSET/LIMIT for efficient pagination
    offset = (page - 1) * page_size
    page_entries = await repo.get_recent_entries(
        scope=scope,
        scope_id=scope_id,
        tier=tier,
        limit=page_size,
        offset=offset,
    )

    # Get total count
    stats = await repo.get_stats(scope, scope_id)

    items = [
        MemoryEntryResponse(
            id=e.id,
            scope=e.scope,
            scope_id=e.scope_id,
            tier=e.tier,
            content=e.content[:OUTPUT_TRUNCATION_LENGTH] if len(e.content) > OUTPUT_TRUNCATION_LENGTH else e.content,
            importance=e.importance,
            access_count=e.access_count,
            last_accessed=e.last_accessed,
            created_at=e.created_at,
        )
        for e in page_entries
    ]

    return MemoryListResponse(
        items=items,
        total=stats.total_entries,
        page=page,
        page_size=page_size,
    )


@router.get("/{entry_id}", response_model=MemoryEntryResponse)
async def get_memory(
    entry_id: str,
    user: CurrentUser,
    db: DbSession,
) -> MemoryEntryResponse:
    """Get a specific memory entry."""
    repo = MemoryRepository(db)
    entry = await repo.get_entry(entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Memory entry not found")

    return MemoryEntryResponse.model_validate(entry)


@router.post("/search", response_model=MemorySearchResponse)
async def search_memories(
    request: MemorySearchRequest,
    user: CurrentUser,
    db: DbSession,
    response: Response = None,
) -> MemorySearchResponse:
    """Search memories by hybrid search (dense + BM25)."""
    repo = MemoryRepository(db)

    # Generate query embedding
    embedding_provider = get_embedding_provider(
        settings.EMBEDDING_PROVIDER,
        model=settings.EMBEDDING_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
    )

    try:
        query_embedding = await embedding_provider.embed_text(request.query)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Embedding service unavailable: {e}",
        )

    # Hybrid search via Qdrant
    results = await repo.search_hybrid(
        query_embedding=query_embedding,
        query_text=request.query,
        user_id=user.id,
        scope=request.scope,
        scope_id=request.scope_id,
        limit=request.limit,
        threshold=request.threshold,
    )

    # Check if Qdrant was degraded during search
    degraded = repo._vector_store.last_search_degraded
    if degraded and response:
        response.headers["X-Search-Degraded"] = "true"

    return MemorySearchResponse(
        results=[
            MemorySearchResult(
                entry=MemoryEntryResponse.model_validate(entry),
                score=score,
            )
            for entry, score in results
        ],
        warning="Vector search unavailable, results may be incomplete" if degraded else None,
    )


@router.get("/stats/{scope}/{scope_id}", response_model=MemoryStatsResponse)
async def get_memory_stats(
    scope: MemoryScope,
    scope_id: str,
    user: CurrentUser,
    db: DbSession,
) -> MemoryStatsResponse:
    """Get memory statistics for a scope."""
    repo = MemoryRepository(db)
    stats = await repo.get_stats(scope, scope_id)

    return MemoryStatsResponse(
        total_entries=stats.total_entries,
        entries_by_tier=stats.entries_by_tier,
        oldest_entry=stats.oldest_entry,
        newest_entry=stats.newest_entry,
    )


@router.delete("/{entry_id}")
async def delete_memory(
    entry_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Delete a memory entry."""
    repo = MemoryRepository(db)
    deleted = await repo.delete_entry(entry_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Memory entry not found")

    await db.commit()

    # Best-effort Qdrant cleanup
    try:
        from .vector_store import QdrantMemoryVectorStore
        vs = QdrantMemoryVectorStore()
        await vs.delete_entry(entry_id)
    except Exception as e:
        logger.error("Qdrant cleanup failed for memory entry %s: %s", entry_id, e)

    return {"status": "deleted"}
