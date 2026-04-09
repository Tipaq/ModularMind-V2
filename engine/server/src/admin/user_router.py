import logging

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from src.auth import CurrentUser, UserRole
from src.auth.dependencies import RequireAdmin
from src.auth.models import User
from src.conversations.models import Conversation
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.database import DbSession
from src.infra.token_pricing import estimate_cost

from .schemas import (
    AdminUserUpdate,
    AdminUserUpdateResponse,
    UserStatsListResponse,
    UserStatsResponse,
)
from .service import compute_user_cost, get_user_or_404
from .user_analytics_router import admin_user_analytics_router
from .user_conversations_router import admin_user_conversations_router

logger = logging.getLogger(__name__)

admin_user_router = APIRouter(prefix="/users", tags=["Admin — Users"], dependencies=[RequireAdmin])
admin_user_router.include_router(admin_user_conversations_router)
admin_user_router.include_router(admin_user_analytics_router)


def _build_user_filters(
    search: str | None, role: UserRole | None, is_active: bool | None
) -> tuple[list, str | None]:
    filters: list = []
    escaped = None
    if search:
        from src.infra.query_utils import escape_like

        escaped = escape_like(search)
        filters.append(User.email.ilike(f"%{escaped}%", escape="\\"))
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active == is_active)
    return filters, escaped


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
    filters, _ = _build_user_filters(search, role, is_active)

    count_query = select(func.count()).select_from(User)
    for f in filters:
        count_query = count_query.where(f)
    total = (await db.execute(count_query)).scalar() or 0

    conv_stats = (
        select(
            Conversation.user_id.label("user_id"),
            func.count().label("conversation_count"),
            func.max(Conversation.updated_at).label("last_conv_at"),
        )
        .group_by(Conversation.user_id)
        .subquery("conv_stats")
    )

    exec_stats = (
        select(
            ExecutionRun.user_id.label("user_id"),
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0).label("total_tokens_prompt"),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0).label(
                "total_tokens_completion"
            ),
            func.count().label("execution_count"),
            func.max(ExecutionRun.completed_at).label("last_exec_at"),
        )
        .where(ExecutionRun.status == ExecutionStatus.COMPLETED)
        .group_by(ExecutionRun.user_id)
        .subquery("exec_stats")
    )

    query = (
        select(
            User,
            func.coalesce(conv_stats.c.conversation_count, 0).label("conversation_count"),
            func.coalesce(exec_stats.c.total_tokens_prompt, 0).label("total_tokens_prompt"),
            func.coalesce(exec_stats.c.total_tokens_completion, 0).label(
                "total_tokens_completion"
            ),
            func.coalesce(exec_stats.c.execution_count, 0).label("execution_count"),
            func.coalesce(exec_stats.c.last_exec_at, conv_stats.c.last_conv_at).label(
                "last_active_at"
            ),
        )
        .outerjoin(conv_stats, conv_stats.c.user_id == User.id)
        .outerjoin(exec_stats, exec_stats.c.user_id == User.id)
    )

    for f in filters:
        query = query.where(f)

    offset = (page - 1) * page_size
    query = (
        query.order_by(
            func.coalesce(exec_stats.c.last_exec_at, conv_stats.c.last_conv_at)
            .desc()
            .nullslast()
        )
        .offset(offset)
        .limit(page_size)
    )

    result = await db.execute(query)
    rows = result.all()

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
        items.append(
            UserStatsResponse(
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
            )
        )

    return UserStatsListResponse(items=items, total=total, page=page, page_size=page_size)


@admin_user_router.get("/{user_id}", response_model=UserStatsResponse)
async def get_user_detail(
    user_id: str,
    user: CurrentUser,
    db: DbSession,
) -> UserStatsResponse:
    target = await get_user_or_404(db, user_id)

    conv_result = await db.execute(
        select(
            func.count().label("conv_count"),
            func.max(Conversation.updated_at).label("last_conv_at"),
        ).where(Conversation.user_id == user_id)
    )
    conv_count, last_conv = conv_result.one()

    exec_result = await db.execute(
        select(
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            func.count(),
            func.max(ExecutionRun.completed_at),
        ).where(
            ExecutionRun.user_id == user_id,
            ExecutionRun.status == ExecutionStatus.COMPLETED,
        )
    )
    tokens_prompt, tokens_completion, exec_count, last_exec = exec_result.one()

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


@admin_user_router.patch("/{user_id}", response_model=AdminUserUpdateResponse)
async def update_user(
    user_id: str,
    data: AdminUserUpdate,
    user: CurrentUser,
    db: DbSession,
) -> AdminUserUpdateResponse:
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify own account",
        )

    target = await get_user_or_404(db, user_id)

    if data.role is not None:
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
        user.email,
        target.email,
        target.role.value,
        target.is_active,
    )

    return AdminUserUpdateResponse.model_validate(target)
