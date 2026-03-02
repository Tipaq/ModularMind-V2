"""
Memory router.

API endpoints for memory operations.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from src.auth import CurrentUser, RequireAdmin
from src.auth.models import User as AuthUser
from src.embedding import get_embedding_provider
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.schemas import PaginatedResponse

from .models import ConsolidationLog, MemoryEdge, MemoryEntry, MemoryScope, MemoryTier, MemoryType
from .repository import MemoryRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["Memory"])
settings = get_settings()


# ---- Response Models ----


class MemoryEntryResponse(BaseModel):
    """Memory entry response."""

    id: str
    scope: MemoryScope
    scope_id: str
    tier: MemoryTier
    memory_type: MemoryType
    content: str
    importance: float
    access_count: int
    last_accessed: datetime | None
    expired_at: datetime | None
    metadata: dict = Field(validation_alias="meta")
    user_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


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
    entries_by_type: dict[str, int]
    oldest_entry: datetime | None
    newest_entry: datetime | None


class GlobalMemoryStatsResponse(BaseModel):
    """Global memory stats for Ops dashboard."""

    total_entries: int
    entries_by_type: dict[str, int]
    entries_by_tier: dict[str, int]
    entries_by_scope: dict[str, int]
    avg_importance: float
    total_accesses: int
    last_consolidation: datetime | None
    entries_decayed_last_cycle: int


class ConsolidationLogResponse(BaseModel):
    """Consolidation log entry response."""

    id: str
    scope: str
    scope_id: str
    action: str
    source_entry_ids: list
    result_entry_id: str | None
    details: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class GraphNodeResponse(BaseModel):
    """Graph node for visualization."""

    id: str
    content: str
    memory_type: str
    scope: str
    scope_id: str
    tier: str
    importance: float
    access_count: int
    entities: list
    tags: list
    user_id: str | None
    last_accessed: datetime | None
    created_at: datetime


class GraphEdgeResponse(BaseModel):
    """Graph edge for visualization."""

    source: str
    target: str
    edge_type: str
    weight: float
    shared_entities: list


class GraphResponse(BaseModel):
    """Graph data for visualization."""

    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]


class MemoryUserResponse(BaseModel):
    """User with memory count."""

    user_id: str
    email: str | None
    memory_count: int


# ---- Admin Endpoints (require RequireAdmin) ----
# IMPORTANT: These must be defined BEFORE the /{entry_id} catch-all route,
# otherwise FastAPI would match "admin" as an entry_id.


@router.get("/admin/stats/global", response_model=GlobalMemoryStatsResponse)
async def get_global_stats(
    _: None = RequireAdmin,
    db: DbSession = None,
) -> GlobalMemoryStatsResponse:
    """Get aggregate memory stats across all scopes (admin only)."""
    # Total by type
    type_result = await db.execute(
        select(
            MemoryEntry.memory_type,
            func.count(MemoryEntry.id),
        )
        .where(MemoryEntry.expired_at.is_(None))
        .group_by(MemoryEntry.memory_type)
    )
    entries_by_type = {mt.value: 0 for mt in MemoryType}
    for row in type_result.all():
        entries_by_type[row[0].value] = row[1]

    # Total by tier
    tier_result = await db.execute(
        select(
            MemoryEntry.tier,
            func.count(MemoryEntry.id),
        )
        .where(MemoryEntry.expired_at.is_(None))
        .group_by(MemoryEntry.tier)
    )
    entries_by_tier = {t.value: 0 for t in MemoryTier}
    for row in tier_result.all():
        entries_by_tier[row[0].value] = row[1]

    # Total by scope
    scope_result = await db.execute(
        select(
            MemoryEntry.scope,
            func.count(MemoryEntry.id),
        )
        .where(MemoryEntry.expired_at.is_(None))
        .group_by(MemoryEntry.scope)
    )
    entries_by_scope = {s.value: 0 for s in MemoryScope}
    for row in scope_result.all():
        entries_by_scope[row[0].value] = row[1]

    # Aggregates
    agg_result = await db.execute(
        select(
            func.avg(MemoryEntry.importance),
            func.sum(MemoryEntry.access_count),
        ).where(MemoryEntry.expired_at.is_(None))
    )
    agg_row = agg_result.one()
    avg_importance = float(agg_row[0] or 0)
    total_accesses = int(agg_row[1] or 0)

    total = sum(entries_by_type.values())

    # Last consolidation
    last_log = await db.execute(
        select(ConsolidationLog.created_at)
        .order_by(ConsolidationLog.created_at.desc())
        .limit(1)
    )
    last_log_row = last_log.scalar_one_or_none()

    return GlobalMemoryStatsResponse(
        total_entries=total,
        entries_by_type=entries_by_type,
        entries_by_tier=entries_by_tier,
        entries_by_scope=entries_by_scope,
        avg_importance=round(avg_importance, 3),
        total_accesses=total_accesses,
        last_consolidation=last_log_row,
        entries_decayed_last_cycle=0,  # TODO: track in consolidation
    )


@router.get("/admin/explore", response_model=MemoryListResponse)
async def explore_memories(
    _: None = RequireAdmin,
    db: DbSession = None,
    user_id: str | None = Query(default=None),
    scope: MemoryScope | None = Query(default=None),
    memory_type: MemoryType | None = Query(default=None),
    tier: MemoryTier | None = Query(default=None),
    include_expired: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> MemoryListResponse:
    """Unified explorer endpoint with all filters (admin only)."""
    query = select(MemoryEntry)
    count_query = select(func.count(MemoryEntry.id))

    # Build filters
    filters = []
    if not include_expired:
        filters.append(MemoryEntry.expired_at.is_(None))
    if user_id:
        filters.append(MemoryEntry.user_id == user_id)
    if scope:
        filters.append(MemoryEntry.scope == scope)
    if memory_type:
        filters.append(MemoryEntry.memory_type == memory_type)
    if tier:
        filters.append(MemoryEntry.tier == tier)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    # Get total count with filters applied
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(MemoryEntry.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    entries = list(result.scalars().all())

    items = [MemoryEntryResponse.model_validate(e) for e in entries]

    return MemoryListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/admin/consolidation/logs")
async def get_consolidation_logs(
    _: None = RequireAdmin,
    db: DbSession = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Get paginated consolidation history (admin only)."""
    offset = (page - 1) * page_size

    total_result = await db.execute(select(func.count(ConsolidationLog.id)))
    total = total_result.scalar()

    result = await db.execute(
        select(ConsolidationLog)
        .order_by(ConsolidationLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    logs = list(result.scalars().all())

    return {
        "items": [ConsolidationLogResponse.model_validate(log) for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/admin/{entry_id}/invalidate")
async def invalidate_memory(
    entry_id: str,
    _: None = RequireAdmin,
    db: DbSession = None,
) -> dict[str, str]:
    """Manually invalidate (soft-delete) a memory entry (admin only)."""
    repo = MemoryRepository(db)
    entry = await repo.get_entry(entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Memory entry not found")

    if entry.expired_at:
        raise HTTPException(status_code=400, detail="Entry already expired")

    await repo.invalidate_entry(entry_id)

    # Log the manual invalidation
    from uuid import uuid4

    log = ConsolidationLog(
        id=str(uuid4()),
        scope=entry.scope.value,
        scope_id=entry.scope_id,
        action="manual_invalidate",
        source_entry_ids=[entry_id],
        details={"reason": "Manual admin invalidation"},
    )
    db.add(log)
    await db.commit()

    return {"status": "invalidated"}


@router.get("/admin/graph", response_model=GraphResponse)
async def get_graph_data(
    _: None = RequireAdmin,
    db: DbSession = None,
    scope: MemoryScope | None = Query(default=None),
    scope_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    memory_type: MemoryType | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    edge_limit: int = Query(default=2000, ge=1, le=5000),
) -> GraphResponse:
    """Get graph data for visualization (admin only)."""
    # Build node query
    query = select(MemoryEntry).where(MemoryEntry.expired_at.is_(None))
    if scope:
        query = query.where(MemoryEntry.scope == scope)
    if scope_id:
        query = query.where(MemoryEntry.scope_id == scope_id)
    if user_id:
        query = query.where(MemoryEntry.user_id == user_id)
    if memory_type:
        query = query.where(MemoryEntry.memory_type == memory_type)

    query = query.order_by(MemoryEntry.importance.desc()).limit(limit)

    result = await db.execute(query)
    entries = list(result.scalars().all())
    entry_ids = {e.id for e in entries}

    # Build nodes
    nodes = [
        GraphNodeResponse(
            id=e.id,
            content=e.content[:200],
            memory_type=e.memory_type.value,
            scope=e.scope.value,
            scope_id=e.scope_id,
            tier=e.tier.value,
            importance=e.importance,
            access_count=e.access_count,
            entities=(e.meta or {}).get("entities", []),
            tags=(e.meta or {}).get("tags", []),
            user_id=e.user_id,
            last_accessed=e.last_accessed,
            created_at=e.created_at,
        )
        for e in entries
    ]

    # Get edges where both source and target are in our node set
    if entry_ids:
        edge_query = (
            select(MemoryEdge)
            .where(
                MemoryEdge.source_id.in_(entry_ids),
                MemoryEdge.target_id.in_(entry_ids),
            )
            .order_by(MemoryEdge.weight.desc())
            .limit(edge_limit)
        )
        edge_result = await db.execute(edge_query)
        edge_rows = list(edge_result.scalars().all())
    else:
        edge_rows = []

    edges = [
        GraphEdgeResponse(
            source=e.source_id,
            target=e.target_id,
            edge_type=e.edge_type.value,
            weight=e.weight,
            shared_entities=e.shared_entities or [],
        )
        for e in edge_rows
    ]

    return GraphResponse(nodes=nodes, edges=edges)


@router.get("/admin/users", response_model=list[MemoryUserResponse])
async def get_memory_users(
    _: None = RequireAdmin,
    db: DbSession = None,
) -> list[MemoryUserResponse]:
    """List users that have memories (for dropdown filter)."""
    result = await db.execute(
        select(
            MemoryEntry.user_id,
            func.count(MemoryEntry.id).label("cnt"),
            AuthUser.email,
        )
        .outerjoin(AuthUser, AuthUser.id == MemoryEntry.user_id)
        .where(
            MemoryEntry.user_id.isnot(None),
            MemoryEntry.expired_at.is_(None),
        )
        .group_by(MemoryEntry.user_id, AuthUser.email)
        .order_by(func.count(MemoryEntry.id).desc())
    )

    return [
        MemoryUserResponse(user_id=row[0], memory_count=row[1], email=row[2])
        for row in result.all()
    ]


# ---- User Endpoints ----
# NOTE: The /{entry_id} catch-all routes MUST come after all /admin/* routes
# to prevent FastAPI from matching "admin" as an entry_id.


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

    offset = (page - 1) * page_size
    page_entries = await repo.get_recent_entries(
        scope=scope,
        scope_id=scope_id,
        tier=tier,
        limit=page_size,
        offset=offset,
    )

    stats = await repo.get_stats(scope, scope_id)

    items = [MemoryEntryResponse.model_validate(e) for e in page_entries]

    return MemoryListResponse(
        items=items,
        total=stats.total_entries,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=MemorySearchResponse)
async def search_memories(
    request: MemorySearchRequest,
    user: CurrentUser,
    db: DbSession,
    response: Response = None,
) -> MemorySearchResponse:
    """Search memories by hybrid search (dense + BM25)."""
    repo = MemoryRepository(db)

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

    results = await repo.search_hybrid(
        query_embedding=query_embedding,
        query_text=request.query,
        user_id=user.id,
        scope=request.scope,
        scope_id=request.scope_id,
        limit=request.limit,
        threshold=request.threshold,
    )

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
        warning="Vector search unavailable, results may be incomplete"
        if degraded
        else None,
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
        entries_by_type=stats.entries_by_type,
        oldest_entry=stats.oldest_entry,
        newest_entry=stats.newest_entry,
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

    try:
        from .vector_store import QdrantMemoryVectorStore

        vs = QdrantMemoryVectorStore()
        await vs.delete_entry(entry_id)
    except Exception as e:
        logger.error("Qdrant cleanup failed for memory entry %s: %s", entry_id, e)

    return {"status": "deleted"}
