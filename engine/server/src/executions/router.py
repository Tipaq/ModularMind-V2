"""
Execution router.

API endpoints for agent and graph execution.
Supports distributed execution via Redis Streams and inline (legacy) mode.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from src.auth import CurrentUser
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.rate_limit import RateLimitDependency

from .feedback import FeedbackCreate, FeedbackResponse
from .models import ExecutionRun
from .scheduler import fair_scheduler
from .schemas import (
    ApprovalRequest,
    ExecutionCreate,
    ExecutionCreatedResponse,
    ExecutionListResponse,
    ExecutionResponse,
    ExecutionStatus,
)
from .service import ExecutionService

logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Rate limit helpers
# ---------------------------------------------------------------------------

def parse_rate_limit(rate_str: str) -> int:
    """Parse rate limit string like '10/minute' into requests_per_minute int."""
    try:
        return int(rate_str.split("/")[0])
    except (ValueError, IndexError):
        return 60


_exec_rate = RateLimitDependency(parse_rate_limit(settings.RATE_LIMIT_EXECUTIONS))
_poll_rate = RateLimitDependency(
    parse_rate_limit(settings.RATE_LIMIT_EXECUTIONS_POLL),
)
_read_rate = RateLimitDependency(parse_rate_limit(settings.RATE_LIMIT_READS))


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def validate_input(data: ExecutionCreate) -> None:
    """Validate input sizes against config limits."""
    prompt_bytes = len(data.prompt.encode("utf-8"))
    if prompt_bytes > settings.MAX_INPUT_PROMPT_SIZE:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Input prompt exceeds max size "
                f"({prompt_bytes} > {settings.MAX_INPUT_PROMPT_SIZE} bytes)"
            ),
        )

    if data.input_data:
        data_bytes = len(json.dumps(data.input_data).encode("utf-8"))
        if data_bytes > settings.MAX_INPUT_DATA_SIZE:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Input data exceeds max size "
                    f"({data_bytes} > {settings.MAX_INPUT_DATA_SIZE} bytes)"
                ),
            )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/executions", tags=["Executions"])


async def _safe_create_execution(
    start_fn,
    resource_id: str,
    data: ExecutionCreate,
    user_id: str,
    db: DbSession,
    service: ExecutionService,
) -> ExecutionCreatedResponse:
    """Shared error handling for execution creation endpoints."""
    try:
        execution = await start_fn(resource_id, data, user_id)
        await db.commit()
        return await dispatch_execution(execution, user_id, service, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to create execution: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create execution")


async def dispatch_execution(
    execution: ExecutionRun,
    user_id: str,
    service: ExecutionService,
    db: DbSession,
    *,
    ab_model_override: str | None = None,
) -> ExecutionCreatedResponse:
    """Common dispatch: fair-scheduler acquire + Redis Streams dispatch + response."""
    acquired = await fair_scheduler.acquire(user_id, execution.id)
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent executions. Try again later.",
            headers={"Retry-After": "10"},
        )
    await service.dispatch_execution(
        execution, ab_model_override=ab_model_override,
    )
    await db.commit()

    return ExecutionCreatedResponse(
        id=execution.id,
        status=execution.status,
        config_version=execution.config_version,
        config_hash=execution.config_hash,
        created_at=execution.created_at,
        stream_url=f"/api/v1/executions/{execution.id}/stream",
    )


@router.get("/{execution_id}/stream")
async def stream_execution(
    execution_id: str,
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    """SSE stream for real-time execution events.

    Subscribes to the Redis pub/sub channel ``execution:{execution_id}``
    and relays every event to the client as a Server-Sent Event.
    """
    from src.infra.redis import get_redis_pool
    from src.infra.sse import sse_response

    # Verify the execution exists and belongs to the user
    result = await db.execute(
        select(ExecutionRun).where(ExecutionRun.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if execution.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    channel = f"execution:{execution_id}"

    async def event_generator():
        import redis.asyncio as aioredis

        r = aioredis.Redis(connection_pool=get_redis_pool())
        pubsub = r.pubsub()
        try:
            await pubsub.subscribe(channel)
            while True:
                if await request.is_disconnected():
                    break
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0,
                )
                if msg and msg["type"] == "message":
                    try:
                        event = json.loads(msg["data"])
                        yield event
                        if event.get("type") in ("complete", "error"):
                            break
                    except (json.JSONDecodeError, TypeError):
                        continue
                else:
                    await asyncio.sleep(0.05)
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
            await r.aclose()

    return await sse_response(event_generator(), request)


@router.post(
    "/agent/{agent_id}",
    response_model=ExecutionCreatedResponse,
    status_code=201,
    dependencies=[Depends(_exec_rate)],
)
async def create_agent_execution(
    agent_id: str,
    data: ExecutionCreate,
    user: CurrentUser,
    db: DbSession,
) -> ExecutionCreatedResponse:
    """Create and start an agent execution.

    Includes A/B test routing: if the agent has an active experiment,
    the model may be overridden for this execution.
    """
    validate_input(data)
    service = ExecutionService(db)

    try:
        execution = await service.start_agent_execution(agent_id, data, user.id)

        # A/B test routing (agent-only — graphs are never A/B routed)
        ab_model_override: str | None = None
        if settings.AB_TESTING_ENABLED:
            try:
                from src.domain_config.provider import get_config_provider
                from src.fine_tuning.ab_testing import ABTestRouter

                config = get_config_provider()
                agent_config = await config.get_agent_config(agent_id)
                default_model_id = agent_config.model_id if agent_config else ""

                ab_router = ABTestRouter(db)
                model_id, experiment_id, variant = await ab_router.get_model_for_execution(
                    agent_id, default_model_id
                )

                if experiment_id:
                    execution.experiment_id = experiment_id
                    execution.experiment_variant = variant
                    ab_model_override = model_id
                    logger.info(
                        "A/B routing execution %s: experiment=%s variant=%s model=%s",
                        execution.id, experiment_id, variant, model_id,
                    )
            except Exception as ab_err:
                # DB errors poison the PostgreSQL transaction — rollback to
                # restore the session so the execution INSERT can be committed.
                await db.rollback()
                # Re-add the execution (rollback cleared it from the session)
                db.add(execution)
                await db.flush()
                logger.warning("A/B routing skipped (session recovered): %s", ab_err)

        await db.commit()
        return await dispatch_execution(
            execution, user.id, service, db,
            ab_model_override=ab_model_override,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to create execution: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create execution")


@router.post(
    "/graph/{graph_id}",
    response_model=ExecutionCreatedResponse,
    status_code=201,
    dependencies=[Depends(_exec_rate)],
)
async def create_graph_execution(
    graph_id: str,
    data: ExecutionCreate,
    user: CurrentUser,
    db: DbSession,
) -> ExecutionCreatedResponse:
    """Create and start a graph execution."""
    validate_input(data)
    service = ExecutionService(db)

    execution = await _safe_create_execution(
        service.start_graph_execution, graph_id, data, user.id, db, service,
    )
    return execution


@router.get(
    "/{execution_id}",
    response_model=ExecutionResponse,
    dependencies=[Depends(_read_rate)],
)
async def get_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ExecutionResponse:
    """Get execution details."""
    result = await db.execute(
        select(ExecutionRun)
        .where(ExecutionRun.id == execution_id)
        .options(selectinload(ExecutionRun.steps))
    )
    execution = result.scalar_one_or_none()

    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    # Check access (user must own the execution)
    if execution.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return ExecutionResponse.model_validate(execution)


@router.get(
    "",
    response_model=ExecutionListResponse,
    dependencies=[Depends(_poll_rate)],
)
async def list_executions(
    user: CurrentUser,
    db: DbSession,
    page: int = 1,
    page_size: int = Query(20, ge=1, le=100),
    status_filter: ExecutionStatus | None = None,
) -> ExecutionListResponse:
    """List user's executions."""
    query = select(ExecutionRun).where(ExecutionRun.user_id == user.id)

    if status_filter:
        query = query.where(ExecutionRun.status == status_filter)

    query = query.order_by(ExecutionRun.created_at.desc())

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query.options(selectinload(ExecutionRun.steps)))
    executions = result.scalars().all()

    return ExecutionListResponse(
        items=[ExecutionResponse.model_validate(e) for e in executions],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{execution_id}/stop")
async def stop_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Stop a running execution."""
    service = ExecutionService(db)

    execution = await service.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    success = await service.stop_execution(execution_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot stop execution in current state",
        )

    await db.commit()
    return {"status": "stopped"}


@router.post("/{execution_id}/pause")
async def pause_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Pause a running execution."""
    service = ExecutionService(db)

    execution = await service.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    success = await service.pause_execution(execution_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot pause execution in current state",
        )

    await db.commit()
    return {"status": "paused"}


@router.post("/{execution_id}/resume")
async def resume_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Resume a paused execution."""
    service = ExecutionService(db)

    execution = await service.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await service.resume_execution(execution_id)
    if not result:
        raise HTTPException(
            status_code=400,
            detail="Cannot resume execution in current state",
        )

    await db.commit()
    return {"status": "resumed"}


# ---------------------------------------------------------------------------
# Approval endpoints
# ---------------------------------------------------------------------------


@router.post("/{execution_id}/approve", response_model=ExecutionResponse)
async def approve_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
    request: ApprovalRequest | None = None,
) -> ExecutionResponse:
    """Approve an execution that is awaiting approval."""
    from src.infra.redis_utils import get_sync_redis_client

    from .approval import ApprovalService

    redis_client = get_sync_redis_client()
    try:
        approval_svc = ApprovalService(db, redis_client)
        success = await approval_svc.approve(
            execution_id, str(user.id),
            notes=request.notes if request else None,
        )

        if not success:
            raise HTTPException(
                status_code=400,
                detail="Execution is not awaiting approval or not found",
            )

        # Single query with eager-loaded steps (avoids redundant DB round-trip)
        result = await db.execute(
            select(ExecutionRun)
            .where(ExecutionRun.id == execution_id)
            .options(selectinload(ExecutionRun.steps))
        )
        execution = result.scalar_one_or_none()
        if not execution:
            raise HTTPException(status_code=404, detail="Execution not found")

        # Dispatch task to resume execution
        service = ExecutionService(db)
        await service.dispatch_execution(execution)

        await db.commit()

        return ExecutionResponse.model_validate(execution)
    finally:
        redis_client.close()


@router.post("/{execution_id}/reject", response_model=ExecutionResponse)
async def reject_execution(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
    request: ApprovalRequest | None = None,
) -> ExecutionResponse:
    """Reject an execution that is awaiting approval."""
    from src.infra.redis_utils import get_sync_redis_client

    from .approval import ApprovalService

    redis_client = get_sync_redis_client()
    try:
        approval_svc = ApprovalService(db, redis_client)
        success = await approval_svc.reject(
            execution_id, str(user.id),
            notes=request.notes if request else None,
        )

        if not success:
            raise HTTPException(
                status_code=400,
                detail="Execution is not awaiting approval or not found",
            )

        result = await db.execute(
            select(ExecutionRun)
            .where(ExecutionRun.id == execution_id)
            .options(selectinload(ExecutionRun.steps))
        )
        execution = result.scalar_one_or_none()
        return ExecutionResponse.model_validate(execution)
    finally:
        redis_client.close()


# ---------------------------------------------------------------------------
# Feedback endpoints
# ---------------------------------------------------------------------------


@router.post("/{execution_id}/feedback")
async def submit_feedback(
    execution_id: str,
    data: FeedbackCreate,
    user: CurrentUser,
    db: DbSession,
):
    """Submit feedback for an execution."""
    from .feedback import FeedbackCreate, FeedbackService

    svc = FeedbackService(db)
    create_data = FeedbackCreate(
        rating=data.rating,
        correction=data.correction,
        original_response=data.original_response,
        step_id=data.step_id,
        agent_id=data.agent_id,
        tags=data.tags,
    )
    feedback = await svc.create_feedback(execution_id, str(user.id), create_data)
    return FeedbackResponse.model_validate(feedback)


@router.get("/{execution_id}/feedback")
async def get_feedback(
    execution_id: str,
    user: CurrentUser,
    db: DbSession,
):
    """Get feedback for an execution."""
    from .feedback import FeedbackService

    svc = FeedbackService(db)
    feedbacks = await svc.get_feedback(execution_id)
    return [FeedbackResponse.model_validate(fb) for fb in feedbacks]
