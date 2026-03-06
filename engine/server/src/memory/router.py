"""
Memory router.

API endpoints for memory operations.
"""

import logging
import time

import redis
from fastapi import APIRouter, HTTPException, Query, Response
from src.infra.query_utils import raise_not_found
from sqlalchemy import case, func, select

from src.auth import CurrentUser, RequireAdmin
from src.auth.models import User as AuthUser
from src.embedding.resolver import get_memory_embedding_provider
from src.infra.config import get_settings
from src.infra.database import DbSession

from .models import ConsolidationLog, MemoryEdge, MemoryEntry, MemoryScope, MemoryTier, MemoryType
from .repository import MemoryRepository
from .schemas import (
    ConsolidationLogResponse,
    ConsolidationTriggerResponse,
    GlobalMemoryStatsResponse,
    GraphEdgeResponse,
    GraphNodeResponse,
    GraphResponse,
    MemoryConfigResponse,
    MemoryConfigUpdate,
    MemoryEntryResponse,
    MemoryListResponse,
    MemorySearchRequest,
    MemorySearchResponse,
    MemorySearchResult,
    MemoryStatsResponse,
    MemoryUserResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["Memory"])
settings = get_settings()


# ---- Admin Endpoints (require RequireAdmin) ----
# IMPORTANT: These must be defined BEFORE the /{entry_id} catch-all route,
# otherwise FastAPI would match "admin" as an entry_id.


@router.get("/admin/stats/global", response_model=GlobalMemoryStatsResponse, dependencies=[RequireAdmin])
async def get_global_stats(
    db: DbSession,
) -> GlobalMemoryStatsResponse:
    """Get aggregate memory stats across all scopes (admin only)."""
    # Single-scan aggregate: conditional counts + avg/sum in one query
    not_expired = MemoryEntry.expired_at.is_(None)
    columns = [
        func.count(MemoryEntry.id).label("total"),
        func.avg(MemoryEntry.importance).label("avg_importance"),
        func.sum(MemoryEntry.access_count).label("total_accesses"),
        *[
            func.sum(case((MemoryEntry.memory_type == mt, 1), else_=0)).label(
                f"type_{mt.value}"
            )
            for mt in MemoryType
        ],
        *[
            func.sum(case((MemoryEntry.tier == t, 1), else_=0)).label(
                f"tier_{t.value}"
            )
            for t in MemoryTier
        ],
        *[
            func.sum(case((MemoryEntry.scope == s, 1), else_=0)).label(
                f"scope_{s.value}"
            )
            for s in MemoryScope
        ],
    ]
    agg_result = await db.execute(select(*columns).where(not_expired))
    row = agg_result.one()

    total = int(row.total or 0)
    entries_by_type = {mt.value: int(getattr(row, f"type_{mt.value}") or 0) for mt in MemoryType}
    entries_by_tier = {t.value: int(getattr(row, f"tier_{t.value}") or 0) for t in MemoryTier}
    entries_by_scope = {s.value: int(getattr(row, f"scope_{s.value}") or 0) for s in MemoryScope}

    # Last consolidation
    last_log = await db.execute(
        select(ConsolidationLog.created_at)
        .order_by(ConsolidationLog.created_at.desc())
        .limit(1)
    )

    return GlobalMemoryStatsResponse(
        total_entries=total,
        entries_by_type=entries_by_type,
        entries_by_tier=entries_by_tier,
        entries_by_scope=entries_by_scope,
        avg_importance=round(float(row.avg_importance or 0), 3),
        total_accesses=int(row.total_accesses or 0),
        last_consolidation=last_log.scalar_one_or_none(),
        entries_decayed_last_cycle=0,
    )


@router.get("/admin/explore", response_model=MemoryListResponse, dependencies=[RequireAdmin])
async def explore_memories(
    db: DbSession,
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


@router.get("/admin/consolidation/logs", dependencies=[RequireAdmin])
async def get_consolidation_logs(
    db: DbSession,
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


@router.post(
    "/admin/consolidation/trigger",
    response_model=ConsolidationTriggerResponse,
    dependencies=[RequireAdmin],
)
async def trigger_consolidation(
    db: DbSession,
) -> ConsolidationTriggerResponse:
    """Manually trigger a memory consolidation cycle (admin only)."""
    from datetime import datetime, timedelta

    from sqlalchemy import delete as sa_delete

    from src.infra.redis import redis_client
    from src.memory.consolidator import apply_exponential_decay

    # Acquire Redis lock (short TTL for manual triggers)
    lock_key = "memory:consolidation:lock"
    lock_acquired = await redis_client.set(lock_key, "1", nx=True, ex=600)
    if not lock_acquired:
        raise HTTPException(
            status_code=409,
            detail="A consolidation is already running. Please wait for it to finish.",
        )

    start = time.monotonic()
    try:
        repo = MemoryRepository(db)

        # Step 1: Exponential decay
        decayed, invalidated = await apply_exponential_decay(db, settings)

        # Step 2: Enumerate active scopes
        all_scopes = await repo.get_distinct_scopes()
        scopes_to_process = all_scopes[:20]

        for scope_val, scope_id in scopes_to_process:
            logger.debug("Manual consolidation: scope %s/%s", scope_val.value, scope_id)

        # Step 3: Cleanup old logs (> 30 days)
        cutoff = datetime.now().replace(tzinfo=None) - timedelta(days=30)
        result = await db.execute(
            sa_delete(ConsolidationLog).where(ConsolidationLog.created_at < cutoff)
        )
        logs_cleaned = result.rowcount or 0

        await db.commit()

        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "Manual consolidation complete: %d decayed, %d invalidated, %d scopes, %dms",
            decayed, invalidated, len(scopes_to_process), elapsed_ms,
        )

        return ConsolidationTriggerResponse(
            status="completed",
            decayed=decayed,
            invalidated=invalidated,
            scopes_processed=len(scopes_to_process),
            logs_cleaned=logs_cleaned,
            duration_ms=elapsed_ms,
        )
    except HTTPException:
        raise
    except Exception as e:  # Consolidation involves DB + Redis + LLM; logs and returns 500
        logger.exception("Manual consolidation failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            await redis_client.delete(lock_key)
        except redis.RedisError:
            logger.error("Failed to release consolidation lock", exc_info=True)


@router.post("/admin/{entry_id}/invalidate", dependencies=[RequireAdmin])
async def invalidate_memory(
    entry_id: str,
    db: DbSession,
) -> dict[str, str]:
    """Manually invalidate (soft-delete) a memory entry (admin only)."""
    repo = MemoryRepository(db)
    entry = await repo.get_entry(entry_id)

    if not entry:
        raise_not_found("Memory entry")

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


@router.get("/admin/graph", response_model=GraphResponse, dependencies=[RequireAdmin])
async def get_graph_data(
    db: DbSession,
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


@router.get("/admin/users", response_model=list[MemoryUserResponse], dependencies=[RequireAdmin])
async def get_memory_users(
    db: DbSession,
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


# ---- Config Endpoints ----


# Mapping: schema field name -> Settings attribute name
_CONFIG_FIELD_MAP: dict[str, str] = {
    "decay_episodic_half_life": "MEMORY_DECAY_EPISODIC_HALF_LIFE",
    "decay_semantic_half_life": "MEMORY_DECAY_SEMANTIC_HALF_LIFE",
    "decay_procedural_half_life": "MEMORY_DECAY_PROCEDURAL_HALF_LIFE",
    "decay_prune_threshold": "MEMORY_DECAY_PRUNE_THRESHOLD",
    "score_weight_recency": "MEMORY_SCORE_WEIGHT_RECENCY",
    "score_weight_importance": "MEMORY_SCORE_WEIGHT_IMPORTANCE",
    "score_weight_relevance": "MEMORY_SCORE_WEIGHT_RELEVANCE",
    "score_weight_frequency": "MEMORY_SCORE_WEIGHT_FREQUENCY",
    "min_relevance_gate": "MEMORY_MIN_RELEVANCE_GATE",
    "extraction_batch_size": "MEMORY_EXTRACTION_BATCH_SIZE",
    "extraction_idle_seconds": "MEMORY_EXTRACTION_IDLE_SECONDS",
    "extraction_scan_interval": "MEMORY_EXTRACTION_SCAN_INTERVAL",
    "buffer_token_threshold": "MEMORY_BUFFER_TOKEN_THRESHOLD",
    "max_entries": "MAX_MEMORY_ENTRIES",
    "fact_extraction_enabled": "FACT_EXTRACTION_ENABLED",
    "fact_extraction_min_messages": "FACT_EXTRACTION_MIN_MESSAGES",
    "scorer_enabled": "MEMORY_SCORER_ENABLED",
    "scorer_min_importance": "MEMORY_SCORER_MIN_IMPORTANCE",
    "context_budget_history_pct": "CONTEXT_BUDGET_HISTORY_PCT",
    "context_budget_memory_pct": "CONTEXT_BUDGET_MEMORY_PCT",
    "context_budget_rag_pct": "CONTEXT_BUDGET_RAG_PCT",
    "context_budget_default_context_window": "CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW",
    "context_budget_max_pct": "CONTEXT_BUDGET_MAX_PCT",
}


def _build_memory_config() -> MemoryConfigResponse:
    """Build response from current settings values."""
    return MemoryConfigResponse(
        **{field: getattr(settings, attr) for field, attr in _CONFIG_FIELD_MAP.items()}
    )


def reload_memory_config() -> None:
    """Reload memory settings from secrets_store into the in-memory singleton.

    Called by the worker before memory tasks so that config changes made
    through the admin API are picked up without restarting the worker process.
    """
    from src.infra.secrets import secrets_store

    for attr in _CONFIG_FIELD_MAP.values():
        stored = secrets_store.get(attr, "")
        if stored:
            field_type = type(getattr(settings, attr))
            if field_type is bool:
                setattr(settings, attr, stored.lower() in ("true", "1", "yes"))
            elif field_type is int:
                setattr(settings, attr, int(stored))
            elif field_type is float:
                setattr(settings, attr, float(stored))


@router.get(
    "/admin/config",
    response_model=MemoryConfigResponse,
    dependencies=[RequireAdmin],
)
async def get_memory_config() -> MemoryConfigResponse:
    """Get current memory configuration (admin only)."""
    from src.infra.secrets import secrets_store

    # Load any persisted overrides
    for attr in _CONFIG_FIELD_MAP.values():
        stored = secrets_store.get(attr, "")
        if stored:
            field_type = type(getattr(settings, attr))
            if field_type is bool:
                setattr(settings, attr, stored.lower() in ("true", "1", "yes"))
            elif field_type is int:
                setattr(settings, attr, int(stored))
            elif field_type is float:
                setattr(settings, attr, float(stored))

    return _build_memory_config()


@router.patch(
    "/admin/config",
    response_model=MemoryConfigResponse,
    dependencies=[RequireAdmin],
)
async def update_memory_config(update: MemoryConfigUpdate) -> MemoryConfigResponse:
    """Update memory configuration (admin only). Persists across restarts."""
    from src.infra.secrets import secrets_store

    for field, attr in _CONFIG_FIELD_MAP.items():
        value = getattr(update, field)
        if value is not None:
            setattr(settings, attr, value)
            secrets_store.set(attr, str(value))

    return _build_memory_config()


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

    embedding_provider = get_memory_embedding_provider()

    try:
        query_embedding = await embedding_provider.embed_text(request.query)
    except Exception as e:  # LLM providers raise heterogeneous errors
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


@router.get("/me/stats", response_model=MemoryStatsResponse)
async def get_my_memory_stats(
    user: CurrentUser,
    db: DbSession,
) -> MemoryStatsResponse:
    """Get aggregate memory stats for the current user across all scopes."""
    repo = MemoryRepository(db)
    stats = await repo.get_user_stats(user.id)

    return MemoryStatsResponse(
        total_entries=stats.total_entries,
        entries_by_tier=stats.entries_by_tier,
        entries_by_type=stats.entries_by_type,
        oldest_entry=stats.oldest_entry,
        newest_entry=stats.newest_entry,
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
        raise_not_found("Memory entry")

    if entry.user_id and entry.user_id != str(user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    return MemoryEntryResponse.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_memory(
    entry_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Delete a memory entry."""
    repo = MemoryRepository(db)
    entry = await repo.get_entry(entry_id)

    if not entry:
        raise_not_found("Memory entry")

    if entry.user_id and entry.user_id != str(user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    await repo.delete_entry(entry_id)

    await db.commit()

    try:
        from .vector_store import QdrantMemoryVectorStore

        vs = QdrantMemoryVectorStore()
        await vs.delete_entry(entry_id)
    except Exception as e:  # Qdrant client can raise various errors
        logger.error("Qdrant cleanup failed for memory entry %s: %s", entry_id, e)

    return {"status": "deleted"}
