from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from src.auth import CurrentUser
from src.auth.service import AuthService
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.database import DbSession
from src.infra.token_pricing import estimate_cost, get_provider, parse_model_name
from src.rag.repository import RAGRepository

from .schemas import (
    CollectionResponse,
    DailyTokenUsage,
    ModelTokenUsage,
    TokenUsageResponse,
    TokenUsageSummary,
)
from .service import get_range_start, get_user_or_404

admin_user_analytics_router = APIRouter(tags=["Admin — Users"])


@admin_user_analytics_router.get("/{user_id}/token-usage", response_model=TokenUsageResponse)
async def get_user_token_usage(
    user_id: str,
    user: CurrentUser,
    db: DbSession,
    range: str = Query(default="30d", pattern="^(24h|7d|30d|all)$"),
    agent_id: str | None = None,
    model: str | None = None,
) -> TokenUsageResponse:
    await get_user_or_404(db, user_id)

    range_start = get_range_start(range)

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

    summary_result = await db.execute(
        select(
            func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
            func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            func.count(),
        ).where(*base_filter)
    )
    total_prompt, total_completion, total_count = summary_result.one()

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

    daily_filter = list(base_filter)
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
        by_model.append(
            ModelTokenUsage(
                model=parse_model_name(model_id),
                provider=get_provider(model_id),
                tokens_prompt=model_prompt,
                tokens_completion=model_completion,
                estimated_cost_usd=cost,
            )
        )

    return TokenUsageResponse(summary=summary, daily=daily, by_model=by_model)


@admin_user_analytics_router.get(
    "/{user_id}/collections", response_model=list[CollectionResponse]
)
async def list_user_collections(
    user_id: str,
    user: CurrentUser,
    db: DbSession,
) -> list[CollectionResponse]:
    await get_user_or_404(db, user_id)

    auth_service = AuthService(db)
    target_groups = await auth_service.get_user_group_slugs(user_id)

    repo = RAGRepository(db)
    collections = await repo.list_collections_for_user(user_id, target_groups)

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
