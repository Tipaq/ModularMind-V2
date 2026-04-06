"""
Execution dispatch functions.

Handles dispatching executions to workers, stop/pause/resume control,
event retrieval, and execution lookup.
"""

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.config import get_settings

from .models import ExecutionRun, ExecutionStatus, ExecutionType

logger = logging.getLogger(__name__)

settings = get_settings()

# Revoke intent TTL: must exceed time_limit + 60s to prevent race condition
_REVOKE_INTENT_TTL = settings.MAX_EXECUTION_TIMEOUT + 120


async def dispatch_execution(
    db: AsyncSession,
    execution: ExecutionRun,
    *,
    ab_model_override: str | None = None,
) -> str:
    """Dispatch execution to worker via Redis Streams.

    Args:
        db: Database session
        execution: ExecutionRun record (must be committed to DB first)
        ab_model_override: Optional model override from A/B testing

    Returns:
        Redis Stream message ID
    """
    from src.infra.publish import enqueue_execution

    if execution.execution_type == ExecutionType.SUPERVISOR:
        raise ValueError("SUPERVISOR executions are tracking records only — not dispatchable")

    msg_id = await enqueue_execution(
        execution_id=execution.id,
        execution_type=execution.execution_type.value,
        agent_id=execution.agent_id,
        graph_id=execution.graph_id,
        input_prompt=execution.input_prompt,
        input_data=execution.input_data,
        user_id=execution.user_id,
        ab_model_override=ab_model_override,
    )

    # Store stream task ID for tracking
    await db.execute(
        update(ExecutionRun)
        .where(ExecutionRun.id == execution.id)
        .values(stream_task_id=msg_id)
    )
    execution.stream_task_id = msg_id

    logger.info(
        "Dispatched execution %s to Redis Streams (msg=%s)",
        execution.id,
        msg_id,
    )
    return msg_id


async def stop_execution(db: AsyncSession, execution_id: str) -> bool:
    """Stop a running execution via Redis cancel intent key."""
    execution = await get_execution(db, execution_id)
    if not execution:
        return False
    if execution.status not in (ExecutionStatus.PENDING, ExecutionStatus.RUNNING):
        return False

    from src.infra.redis import get_redis_client

    redis = await get_redis_client()
    if redis:
        try:
            await redis.set(
                f"revoke_intent:{execution_id}",
                "cancel",
                ex=_REVOKE_INTENT_TTL,
            )
        finally:
            await redis.aclose()

    logger.info("Sent cancel intent for execution %s", execution_id)
    return True


async def pause_execution(db: AsyncSession, execution_id: str) -> bool:
    """Pause a running execution via Redis pause intent key."""
    execution = await get_execution(db, execution_id)
    if not execution:
        return False
    if execution.status != ExecutionStatus.RUNNING:
        return False

    from src.infra.redis import get_redis_client

    redis = await get_redis_client()
    if redis:
        try:
            await redis.set(
                f"revoke_intent:{execution_id}",
                "pause",
                ex=_REVOKE_INTENT_TTL,
            )
        finally:
            await redis.aclose()

    logger.info("Sent pause intent for execution %s", execution_id)
    return True


async def resume_execution(
    db: AsyncSession,
    execution_id: str,
    dispatch_fn: Callable[[AsyncSession, ExecutionRun], Awaitable[str]],
) -> ExecutionRun | None:
    """Resume a paused or approved execution by dispatching a new task.

    Args:
        db: Database session
        execution_id: Execution ID to resume
        dispatch_fn: Callback to dispatch the execution (avoids circular dep)

    Returns:
        Updated ExecutionRun or None if not found/not resumable
    """
    execution = await get_execution(db, execution_id)
    if not execution:
        return None
    if execution.status not in (ExecutionStatus.PAUSED, ExecutionStatus.PENDING):
        return None

    execution.status = ExecutionStatus.PENDING
    await db.flush()

    await dispatch_fn(db, execution)
    await db.flush()

    logger.info("Resumed execution %s", execution_id)
    return execution


async def get_execution_events(
    execution_id: str,
    last_seq: int = 0,
) -> list[dict[str, Any]]:
    """Get buffered events for polling clients.

    Reads from Redis buffer list and filters by sequence number.

    Args:
        execution_id: Execution ID
        last_seq: Last seen sequence number (filter events > last_seq)

    Returns:
        List of events after last_seq
    """
    from src.infra.redis import get_redis_client

    redis = await get_redis_client()
    if not redis:
        return []

    try:
        buffer_key = f"buffer:{execution_id}"
        raw_events = await redis.lrange(buffer_key, 0, -1)

        events = []
        for raw in raw_events:
            try:
                event = json.loads(raw)
                if event.get("seq", 0) > last_seq:
                    events.append(event)
            except (json.JSONDecodeError, TypeError):
                continue

        return events
    finally:
        await redis.aclose()


async def get_execution(db: AsyncSession, execution_id: str) -> ExecutionRun | None:
    """Get execution by ID."""
    result = await db.execute(select(ExecutionRun).where(ExecutionRun.id == execution_id))
    return result.scalar_one_or_none()
