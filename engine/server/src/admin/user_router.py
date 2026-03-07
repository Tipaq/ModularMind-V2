"""Admin user management router.

Provides user listing with aggregated stats, per-user detail views,
token usage analytics, memory/RAG browsing, and moderation actions.
All endpoints require admin (level 1+) role.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from src.auth import CurrentUser, UserRole
from src.auth.dependencies import RequireAdmin
from src.auth.models import User
from src.auth.service import AuthService
from src.conversations.models import Conversation, ConversationMessage
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.database import DbSession
from src.infra.token_pricing import estimate_cost, get_provider, parse_model_name
from src.rag.repository import RAGRepository

from .schemas import (
    AdminConversationItem,
    AdminConversationListResponse,
    AdminConversationMessagesResponse,
    AdminMessageResponse,
    AdminUserUpdate,
    AdminUserUpdateResponse,
    CollectionResponse,
    DailyTokenUsage,
    DeleteCountResponse,
    ModelTokenUsage,
    TokenUsageResponse,
    TokenUsageSummary,
    UserStatsListResponse,
    UserStatsResponse,
)
from .service import compute_user_cost, get_range_start, get_user_or_404

logger = logging.getLogger(__name__)

admin_user_router = APIRouter(
    prefix="/users", tags=["Admin — Users"], dependencies=[RequireAdmin]
)


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
    escaped = None
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

    # Batch compute costs for all users on this page (1 query instead of N)
    user_ids = [row[0].id for row in rows]
    cost_map: dict[str, float] = {}
    if user_ids:
        cost_result = await db.execute(
            select(
                ExecutionRun.user_id,
                ExecutionRun.model,
                func.sum(ExecutionRun.tokens_prompt),
                func.sum(ExecutionRun.tokens_completion),
            )
            .where(
                ExecutionRun.user_id.in_(user_ids),
                ExecutionRun.status == ExecutionStatus.COMPLETED,
                ExecutionRun.model.isnot(None),
            )
            .group_by(ExecutionRun.user_id, ExecutionRun.model)
        )
        for uid, model_id, prompt_tokens, completion_tokens in cost_result:
            cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
            if cost is not None:
                cost_map[uid] = cost_map.get(uid, 0.0) + cost

    items = []
    for row in rows:
        u = row[0]
        items.append(UserStatsResponse(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            conversation_count=row[1],
            total_tokens_prompt=row[2],
            total_tokens_completion=row[3],
            execution_count=row[4],
            estimated_cost_usd=cost_map.get(u.id),
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
    """Get single user with aggregated stats (admin+).

    Combines conversation count, token totals, execution count, and last activity
    into a single query + one cost aggregation query (2 queries total).
    """
    target = await get_user_or_404(db, user_id)

    # Single aggregation query for all stats
    stats_result = await db.execute(
        select(
            # Conversation count (correlated subquery)
            select(func.count())
            .where(Conversation.user_id == user_id)
            .scalar_subquery()
            .label("conv_count"),
            # Token + execution aggregates
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            func.count(),
            func.max(ExecutionRun.completed_at),
        ).where(
            ExecutionRun.user_id == user_id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
    )
    conv_count, tokens_prompt, tokens_completion, exec_count, last_exec = stats_result.one()

    # Last conversation update (lightweight scalar)
    last_conv = (await db.execute(
        select(func.max(Conversation.updated_at)).where(Conversation.user_id == user_id)
    )).scalar()
    last_active = last_exec or last_conv

    cost = await compute_user_cost(db, user_id)

    return UserStatsResponse(
        id=target.id,
        email=target.email,
        role=target.role,
        is_active=target.is_active,
        conversation_count=conv_count,
        total_tokens_prompt=tokens_prompt,
        total_tokens_completion=tokens_completion,
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
    await get_user_or_404(db, user_id)

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

    # Batch fetch all per-conversation data (3 queries instead of 3*N)
    conv_ids = [c.id for c in convs]

    msg_count_map: dict[str, int] = {}
    token_map: dict[str, tuple[int, int]] = {}
    conv_cost_map: dict[str, float] = {}

    if conv_ids:
        # Message counts
        msg_result = await db.execute(
            select(
                ConversationMessage.conversation_id,
                func.count(),
            )
            .where(ConversationMessage.conversation_id.in_(conv_ids))
            .group_by(ConversationMessage.conversation_id)
        )
        msg_count_map = dict(msg_result.all())

        # Token totals
        token_result = await db.execute(
            select(
                ExecutionRun.session_id,
                func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
                func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            )
            .where(
                ExecutionRun.session_id.in_(conv_ids),
                ExecutionRun.status == ExecutionStatus.COMPLETED,
            )
            .group_by(ExecutionRun.session_id)
        )
        token_map = {row[0]: (row[1], row[2]) for row in token_result}

        # Cost data (per model per conversation)
        cost_result = await db.execute(
            select(
                ExecutionRun.session_id,
                ExecutionRun.model,
                func.sum(ExecutionRun.tokens_prompt),
                func.sum(ExecutionRun.tokens_completion),
            )
            .where(
                ExecutionRun.session_id.in_(conv_ids),
                ExecutionRun.status == ExecutionStatus.COMPLETED,
                ExecutionRun.model.isnot(None),
            )
            .group_by(ExecutionRun.session_id, ExecutionRun.model)
        )
        for sid, model_id, prompt_tokens, completion_tokens in cost_result:
            cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
            if cost is not None:
                conv_cost_map[sid] = conv_cost_map.get(sid, 0.0) + cost

    items = []
    for c in convs:
        tp, tc = token_map.get(c.id, (0, 0))
        items.append(AdminConversationItem(
            id=c.id,
            agent_id=c.agent_id,
            title=c.title,
            message_count=msg_count_map.get(c.id, 0),
            tokens_prompt=tp,
            tokens_completion=tc,
            estimated_cost=conv_cost_map.get(c.id),
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

    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> AdminConversationMessagesResponse:
    """Get paginated messages for a specific conversation (admin+)."""
    target = await get_user_or_404(db, user_id)

    conv = (await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Count total messages
    total = (await db.execute(
        select(func.count()).where(
            ConversationMessage.conversation_id == conversation_id
        )
    )).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    messages = (await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
        .offset(offset)
        .limit(page_size)
    )).scalars().all()

    return AdminConversationMessagesResponse(
        conversation_id=conversation_id,
        user_id=user_id,
        user_email=target.email,
        total=total,
        page=page,
        page_size=page_size,
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
    await get_user_or_404(db, user_id)

    range_start = get_range_start(range)

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
    total_prompt, total_completion, total_count = summary_result.one()

    # Cost for summary — aggregate per model to avoid fetching every row
    cost_rows = await db.execute(
        select(
            ExecutionRun.model,
            func.sum(ExecutionRun.tokens_prompt),
            func.sum(ExecutionRun.tokens_completion),
        )
        .where(*base_filter, ExecutionRun.model.isnot(None))
        .group_by(ExecutionRun.model)
    )
    summary_cost = 0.0
    has_cloud = False
    for model_id, prompt_tokens, completion_tokens in cost_rows:
        cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
        if cost is not None:
            summary_cost += cost
            has_cloud = True

    summary = TokenUsageSummary(
        total_prompt=total_prompt,
        total_completion=total_completion,
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
    for date_val, model_id, daily_prompt, daily_completion, daily_count in daily_rows:
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
        entry.tokens_prompt += daily_prompt
        entry.tokens_completion += daily_completion
        entry.execution_count += daily_count

        if model_id:
            day_cost = estimate_cost(model_id, daily_prompt, daily_completion)
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
    for model_id, model_prompt, model_completion in model_rows:
        cost = estimate_cost(model_id, model_prompt, model_completion)
        by_model.append(ModelTokenUsage(
            model=parse_model_name(model_id),
            provider=get_provider(model_id),
            tokens_prompt=model_prompt,
            tokens_completion=model_completion,
            estimated_cost_usd=cost,
        ))

    return TokenUsageResponse(summary=summary, daily=daily, by_model=by_model)


@admin_user_router.get("/{user_id}/collections", response_model=list[CollectionResponse])
async def list_user_collections(
    user_id: str,
    user: CurrentUser,
    db: DbSession,

) -> list[CollectionResponse]:
    """List RAG collections accessible to a specific user (admin+)."""
    await get_user_or_404(db, user_id)

    auth_service = AuthService(db)
    target_groups = await auth_service.get_user_group_slugs(user_id)

    repo = RAGRepository(db)
    collections = await repo.list_collections_for_user(user_id, target_groups)

    # Batch fetch chunk counts (1 query instead of N)
    from src.rag.models import RAGChunk

    collection_ids = [c.id for c in collections]
    chunk_count_map: dict[str, int] = {}
    if collection_ids:
        chunk_result = await db.execute(
            select(
                RAGChunk.collection_id,
                func.count(),
            )
            .where(RAGChunk.collection_id.in_(collection_ids))
            .group_by(RAGChunk.collection_id)
        )
        chunk_count_map = dict(chunk_result.all())

    return [
        CollectionResponse(
            id=c.id,
            name=c.name,
            scope=c.scope,
            owner_user_id=c.owner_user_id,
            allowed_groups=c.allowed_groups or [],
            chunk_count=chunk_count_map.get(c.id, 0),
            created_at=c.created_at,
        )
        for c in collections
    ]


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

    target = await get_user_or_404(db, user_id)

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

    await get_user_or_404(db, user_id)

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


