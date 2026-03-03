"""Admin user management router.

Provides user listing with aggregated stats, per-user detail views,
token usage analytics, memory/RAG browsing, and moderation actions.
All endpoints require admin (level 1+) role.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import CurrentUser, UserRole
from src.auth.dependencies import RequireAdmin
from src.auth.models import User
from src.auth.service import AuthService
from src.conversations.models import Conversation, ConversationMessage
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.database import DbSession
from src.infra.token_pricing import estimate_cost, get_provider, parse_model_name
from src.memory.models import MemoryEntry, MemoryScope, MemoryTier
from src.memory.vector_store import QdrantMemoryVectorStore
from src.rag.models import RAGScope
from src.rag.repository import RAGRepository

logger = logging.getLogger(__name__)

admin_user_router = APIRouter(
    prefix="/users", tags=["Admin — Users"], dependencies=[RequireAdmin]
)


# ─── Schemas ────────────────────────────────────────────────────────────

class UserStatsResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    is_active: bool
    conversation_count: int
    total_tokens_prompt: int
    total_tokens_completion: int
    execution_count: int
    estimated_cost_usd: float | None
    last_active_at: datetime | None
    created_at: datetime


class UserStatsListResponse(BaseModel):
    items: list[UserStatsResponse]
    total: int
    page: int
    page_size: int


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


class AdminUserUpdateResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeleteCountResponse(BaseModel):
    deleted_count: int


class AdminConversationItem(BaseModel):
    id: str
    agent_id: str | None
    title: str | None
    message_count: int
    tokens_prompt: int
    tokens_completion: int
    estimated_cost: float | None
    created_at: datetime
    updated_at: datetime


class AdminConversationListResponse(BaseModel):
    items: list[AdminConversationItem]
    total: int
    page: int
    page_size: int


class AdminMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    metadata: dict | None
    execution_id: str | None
    created_at: datetime


class AdminConversationMessagesResponse(BaseModel):
    conversation_id: str
    user_id: str
    user_email: str
    messages: list[AdminMessageResponse]


class TokenUsageSummary(BaseModel):
    total_prompt: int
    total_completion: int
    estimated_cost_usd: float | None
    execution_count: int


class DailyTokenUsage(BaseModel):
    date: str  # YYYY-MM-DD
    tokens_prompt: int
    tokens_completion: int
    estimated_cost_usd: float | None
    execution_count: int


class ModelTokenUsage(BaseModel):
    model: str
    provider: str | None
    tokens_prompt: int
    tokens_completion: int
    estimated_cost_usd: float | None


class TokenUsageResponse(BaseModel):
    summary: TokenUsageSummary
    daily: list[DailyTokenUsage]
    by_model: list[ModelTokenUsage]


class MemoryEntryResponse(BaseModel):
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


class MemoryListResponse(BaseModel):
    items: list[MemoryEntryResponse]
    total: int
    page: int
    page_size: int


class CollectionResponse(BaseModel):
    id: str
    name: str
    scope: RAGScope
    owner_user_id: str | None
    allowed_groups: list[str]
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Helpers ────────────────────────────────────────────────────────────

async def _compute_user_cost(db: AsyncSession, user_id: str) -> float | None:
    """Sum estimated cost across all completed executions for a user."""
    result = await db.execute(
        select(
            ExecutionRun.model,
            ExecutionRun.tokens_prompt,
            ExecutionRun.tokens_completion,
        )
        .where(
            ExecutionRun.user_id == user_id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
            ExecutionRun.model.isnot(None),
        )
    )
    total = 0.0
    has_cloud = False
    for model_id, prompt_tokens, completion_tokens in result:
        cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
        if cost is not None:
            total += cost
            has_cloud = True
    return total if has_cloud else None


async def _get_user_or_404(db: AsyncSession, user_id: str) -> User:
    """Fetch user by ID or raise 404."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _get_range_start(range_param: str) -> datetime | None:
    """Convert range string to start datetime."""
    now = datetime.now(UTC).replace(tzinfo=None)
    if range_param == "24h":
        return now - timedelta(hours=24)
    elif range_param == "7d":
        return now - timedelta(days=7)
    elif range_param == "30d":
        return now - timedelta(days=30)
    return None  # "all"


# ─── Endpoints ──────────────────────────────────────────────────────────


@admin_user_router.get("", response_model=UserStatsListResponse)
async def list_users_with_stats(
    user: CurrentUser,
    db: DbSession,

    search: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> UserStatsListResponse:
    """List all users with aggregated stats (admin+)."""
    # Base query with subquery aggregations
    conv_count = (
        select(func.count())
        .where(Conversation.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    tokens_p = (
        select(func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0))
        .where(
            ExecutionRun.user_id == User.id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
        .correlate(User)
        .scalar_subquery()
    )
    tokens_c = (
        select(func.coalesce(func.sum(ExecutionRun.tokens_completion), 0))
        .where(
            ExecutionRun.user_id == User.id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
        .correlate(User)
        .scalar_subquery()
    )
    exec_count = (
        select(func.count())
        .where(
            ExecutionRun.user_id == User.id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
        .correlate(User)
        .scalar_subquery()
    )
    last_exec = (
        select(func.max(ExecutionRun.completed_at))
        .where(ExecutionRun.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    last_conv = (
        select(func.max(Conversation.updated_at))
        .where(Conversation.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    query = select(
        User,
        conv_count.label("conversation_count"),
        tokens_p.label("total_tokens_prompt"),
        tokens_c.label("total_tokens_completion"),
        exec_count.label("execution_count"),
        func.coalesce(last_exec, last_conv).label("last_active_at"),
    )

    # Apply filters
    if search:
        from src.infra.query_utils import escape_like
        escaped = escape_like(search)
        query = query.where(User.email.ilike(f"%{escaped}%", escape="\\"))
    if role is not None:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Count total
    count_query = select(func.count()).select_from(User)
    if search:
        from src.infra.query_utils import escape_like
        escaped = escape_like(search)
        count_query = count_query.where(User.email.ilike(f"%{escaped}%", escape="\\"))
    if role is not None:
        count_query = count_query.where(User.role == role)
    if is_active is not None:
        count_query = count_query.where(User.is_active == is_active)
    total = (await db.execute(count_query)).scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(
        func.coalesce(last_exec, last_conv).desc().nullslast()
    ).offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        u = row[0]
        cost = await _compute_user_cost(db, u.id)
        items.append(UserStatsResponse(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            conversation_count=row[1],
            total_tokens_prompt=row[2],
            total_tokens_completion=row[3],
            execution_count=row[4],
            estimated_cost_usd=cost,
            last_active_at=row[5],
            created_at=u.created_at,
        ))

    return UserStatsListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@admin_user_router.get("/{user_id}", response_model=UserStatsResponse)
async def get_user_detail(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

) -> UserStatsResponse:
    """Get single user with aggregated stats (admin+)."""
    target = await _get_user_or_404(db, user_id)

    conv_count = (await db.execute(
        select(func.count()).where(Conversation.user_id == user_id)
    )).scalar() or 0

    exec_result = await db.execute(
        select(
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            func.count(),
        ).where(
            ExecutionRun.user_id == user_id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
    )
    tokens_p, tokens_c, exec_count = exec_result.one()

    last_exec = (await db.execute(
        select(func.max(ExecutionRun.completed_at)).where(ExecutionRun.user_id == user_id)
    )).scalar()
    last_conv = (await db.execute(
        select(func.max(Conversation.updated_at)).where(Conversation.user_id == user_id)
    )).scalar()
    last_active = last_exec or last_conv

    cost = await _compute_user_cost(db, user_id)

    return UserStatsResponse(
        id=target.id,
        email=target.email,
        role=target.role,
        is_active=target.is_active,
        conversation_count=conv_count,
        total_tokens_prompt=tokens_p,
        total_tokens_completion=tokens_c,
        execution_count=exec_count,
        estimated_cost_usd=cost,
        last_active_at=last_active,
        created_at=target.created_at,
    )


@admin_user_router.get(
    "/{user_id}/conversations", response_model=AdminConversationListResponse
)
async def list_user_conversations(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

    agent_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> AdminConversationListResponse:
    """List all conversations for a specific user (admin+)."""
    await _get_user_or_404(db, user_id)

    base = select(Conversation).where(Conversation.user_id == user_id)
    if agent_id:
        base = base.where(Conversation.agent_id == agent_id)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    offset = (page - 1) * page_size
    convs_result = await db.execute(
        base.order_by(Conversation.updated_at.desc())
        .offset(offset).limit(page_size)
    )
    convs = convs_result.scalars().all()

    items = []
    for c in convs:
        # Message count
        msg_count = (await db.execute(
            select(func.count()).where(ConversationMessage.conversation_id == c.id)
        )).scalar() or 0

        # Token totals from executions linked to this conversation
        exec_agg = await db.execute(
            select(
                func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
                func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            ).where(
                ExecutionRun.session_id == c.id,
                ExecutionRun.status == ExecutionStatus.COMPLETED,
            )
        )
        tp, tc = exec_agg.one()

        # Cost for this conversation's executions
        exec_rows = await db.execute(
            select(
                ExecutionRun.model,
                ExecutionRun.tokens_prompt,
                ExecutionRun.tokens_completion,
            ).where(
                ExecutionRun.session_id == c.id,
                ExecutionRun.status == ExecutionStatus.COMPLETED,
                ExecutionRun.model.isnot(None),
            )
        )
        conv_cost = 0.0
        has_cloud = False
        for model_id, p, comp in exec_rows:
            cost = estimate_cost(model_id, p, comp)
            if cost is not None:
                conv_cost += cost
                has_cloud = True

        items.append(AdminConversationItem(
            id=c.id,
            agent_id=c.agent_id,
            title=c.title,
            message_count=msg_count,
            tokens_prompt=tp,
            tokens_completion=tc,
            estimated_cost=conv_cost if has_cloud else None,
            created_at=c.created_at,
            updated_at=c.updated_at,
        ))

    return AdminConversationListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@admin_user_router.get(
    "/{user_id}/conversations/{conversation_id}/messages",
    response_model=AdminConversationMessagesResponse,
)
async def get_conversation_messages(
    user_id: str,
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,

) -> AdminConversationMessagesResponse:
    """Get all messages for a specific conversation (admin+)."""
    target = await _get_user_or_404(db, user_id)

    conv = (await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
    )).scalars().all()

    return AdminConversationMessagesResponse(
        conversation_id=conversation_id,
        user_id=user_id,
        user_email=target.email,
        messages=[
            AdminMessageResponse(
                id=m.id,
                role=m.role.value,
                content=m.content,
                metadata=m.meta,
                execution_id=m.execution_id,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


@admin_user_router.get("/{user_id}/token-usage", response_model=TokenUsageResponse)
async def get_user_token_usage(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

    range: str = Query(default="30d", pattern="^(24h|7d|30d|all)$"),
    agent_id: str | None = None,
    model: str | None = None,
) -> TokenUsageResponse:
    """Get token usage analytics for a specific user (admin+)."""
    await _get_user_or_404(db, user_id)

    range_start = _get_range_start(range)

    # Base filter
    base_filter = [
        ExecutionRun.user_id == user_id,
        ExecutionRun.status == ExecutionStatus.COMPLETED,
    ]
    if range_start:
        base_filter.append(ExecutionRun.completed_at >= range_start)
    if agent_id:
        base_filter.append(ExecutionRun.agent_id == agent_id)
    if model:
        base_filter.append(ExecutionRun.model == model)

    # Summary
    summary_result = await db.execute(
        select(
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            func.count(),
        ).where(*base_filter)
    )
    total_p, total_c, total_count = summary_result.one()

    # Cost for summary
    cost_rows = await db.execute(
        select(
            ExecutionRun.model,
            ExecutionRun.tokens_prompt,
            ExecutionRun.tokens_completion,
        ).where(*base_filter, ExecutionRun.model.isnot(None))
    )
    summary_cost = 0.0
    has_cloud = False
    for m, p, c in cost_rows:
        cost = estimate_cost(m, p, c)
        if cost is not None:
            summary_cost += cost
            has_cloud = True

    summary = TokenUsageSummary(
        total_prompt=total_p,
        total_completion=total_c,
        estimated_cost_usd=summary_cost if has_cloud else None,
        execution_count=total_count,
    )

    # Daily aggregation (group by date + model for cost calculation)
    daily_filter = list(base_filter)
    # For "all" range, cap daily data to 90 days
    if range == "all":
        ninety_days_ago = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=90)
        daily_filter.append(ExecutionRun.completed_at >= ninety_days_ago)

    daily_rows = await db.execute(
        select(
            func.date(ExecutionRun.completed_at).label("date"),
            ExecutionRun.model,
            func.sum(ExecutionRun.tokens_prompt),
            func.sum(ExecutionRun.tokens_completion),
            func.count(),
        )
        .where(*daily_filter)
        .group_by(func.date(ExecutionRun.completed_at), ExecutionRun.model)
        .order_by(func.date(ExecutionRun.completed_at))
    )

    # Aggregate per day (multiple models per day → sum)
    daily_map: dict[str, DailyTokenUsage] = {}
    for date_val, model_id, dp, dc, dcount in daily_rows:
        date_str = str(date_val)
        if date_str not in daily_map:
            daily_map[date_str] = DailyTokenUsage(
                date=date_str,
                tokens_prompt=0,
                tokens_completion=0,
                estimated_cost_usd=None,
                execution_count=0,
            )
        entry = daily_map[date_str]
        entry.tokens_prompt += dp
        entry.tokens_completion += dc
        entry.execution_count += dcount

        if model_id:
            day_cost = estimate_cost(model_id, dp, dc)
            if day_cost is not None:
                entry.estimated_cost_usd = (entry.estimated_cost_usd or 0.0) + day_cost

    daily = list(daily_map.values())

    # By model aggregation
    model_rows = await db.execute(
        select(
            ExecutionRun.model,
            func.sum(ExecutionRun.tokens_prompt),
            func.sum(ExecutionRun.tokens_completion),
        )
        .where(*base_filter, ExecutionRun.model.isnot(None))
        .group_by(ExecutionRun.model)
    )

    by_model = []
    for model_id, mp, mc in model_rows:
        cost = estimate_cost(model_id, mp, mc)
        by_model.append(ModelTokenUsage(
            model=parse_model_name(model_id),
            provider=get_provider(model_id),
            tokens_prompt=mp,
            tokens_completion=mc,
            estimated_cost_usd=cost,
        ))

    return TokenUsageResponse(summary=summary, daily=daily, by_model=by_model)


@admin_user_router.get("/{user_id}/memory", response_model=MemoryListResponse)
async def list_user_memory(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

    scope: MemoryScope | None = None,
    tier: MemoryTier | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> MemoryListResponse:
    """List memory entries for a specific user (admin+)."""
    await _get_user_or_404(db, user_id)

    base = select(MemoryEntry).where(MemoryEntry.user_id == user_id)
    if scope:
        base = base.where(MemoryEntry.scope == scope)
    if tier:
        base = base.where(MemoryEntry.tier == tier)
    if search:
        from src.infra.query_utils import escape_like
        escaped = escape_like(search)
        base = base.where(MemoryEntry.content.ilike(f"%{escaped}%", escape="\\"))

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    offset = (page - 1) * page_size
    entries = (await db.execute(
        base.order_by(MemoryEntry.created_at.desc())
        .offset(offset).limit(page_size)
    )).scalars().all()

    return MemoryListResponse(
        items=[MemoryEntryResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_user_router.get("/{user_id}/collections", response_model=list[CollectionResponse])
async def list_user_collections(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

) -> list[CollectionResponse]:
    """List RAG collections accessible to a specific user (admin+)."""
    await _get_user_or_404(db, user_id)

    auth_service = AuthService(db)
    target_groups = await auth_service.get_user_group_slugs(user_id)

    repo = RAGRepository(db)
    collections = await repo.list_collections_for_user(user_id, target_groups)

    result = []
    for c in collections:
        # Get chunk count
        from src.rag.models import RAGChunk
        chunk_count = (await db.execute(
            select(func.count()).where(RAGChunk.collection_id == c.id)
        )).scalar() or 0

        result.append(CollectionResponse(
            id=c.id,
            name=c.name,
            scope=c.scope,
            owner_user_id=c.owner_user_id,
            allowed_groups=c.allowed_groups or [],
            chunk_count=chunk_count,
            created_at=c.created_at,
        ))

    return result


# ─── Moderation ─────────────────────────────────────────────────────────


@admin_user_router.patch("/{user_id}", response_model=AdminUserUpdateResponse)
async def update_user(
    user_id: str,
    data: AdminUserUpdate,
    user: CurrentUser,
    db: DbSession,

) -> AdminUserUpdateResponse:
    """Update user role and/or active status (admin+)."""
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify own account",
        )

    target = await _get_user_or_404(db, user_id)

    if data.role is not None:
        # Can only assign roles at or below own level
        if data.role.level > user.role.level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot assign role {data.role.value} (above your level)",
            )
        target.role = data.role

    if data.is_active is not None:
        target.is_active = data.is_active

    await db.flush()
    await db.refresh(target)
    await db.commit()

    logger.info(
        "Admin %s updated user %s: role=%s active=%s",
        user.email, target.email, target.role.value, target.is_active,
    )

    return AdminUserUpdateResponse.model_validate(target)


@admin_user_router.delete(
    "/{user_id}/conversations", response_model=DeleteCountResponse
)
async def delete_user_conversations(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

) -> DeleteCountResponse:
    """Delete ALL conversations for a user (cascades to messages). Admin+."""
    from sqlalchemy import update

    await _get_user_or_404(db, user_id)

    # Count before delete
    count = (await db.execute(
        select(func.count()).where(Conversation.user_id == user_id)
    )).scalar() or 0

    if count > 0:
        # Detach execution_runs from conversations being deleted.
        # execution_runs.session_id has a FK to conversations.id — deleting
        # conversations without NULLing it out causes an integrity error.
        conv_ids = (await db.execute(
            select(Conversation.id).where(Conversation.user_id == user_id)
        )).scalars().all()

        if conv_ids:
            await db.execute(
                update(ExecutionRun)
                .where(ExecutionRun.session_id.in_(conv_ids))
                .values(session_id=None)
            )

        # Now safe to cascade delete (messages deleted via FK cascade)
        await db.execute(
            delete(Conversation).where(Conversation.user_id == user_id)
        )
        await db.commit()

    logger.info("Admin %s deleted %d conversations for user %s", user.email, count, user_id)
    return DeleteCountResponse(deleted_count=count)


@admin_user_router.delete(
    "/{user_id}/memory", response_model=DeleteCountResponse
)
async def delete_user_memory(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

) -> DeleteCountResponse:
    """Clear ALL memory entries for a user from PostgreSQL and Qdrant. Admin+."""
    await _get_user_or_404(db, user_id)

    # Delete from Qdrant first (best effort)
    vector_store = QdrantMemoryVectorStore()
    try:
        await vector_store.delete_by_user_id(user_id)
    except Exception:
        logger.warning("Qdrant delete_by_user_id failed for %s", user_id, exc_info=True)

    # Delete from PostgreSQL
    count = (await db.execute(
        select(func.count()).where(MemoryEntry.user_id == user_id)
    )).scalar() or 0

    await db.execute(
        delete(MemoryEntry).where(MemoryEntry.user_id == user_id)
    )
    await db.commit()

    logger.info("Admin %s cleared %d memory entries for user %s", user.email, count, user_id)
    return DeleteCountResponse(deleted_count=count)
