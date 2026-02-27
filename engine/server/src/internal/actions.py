"""
Internal action endpoints.

Admin actions for worker management, DLQ operations,
execution control, scheduler cleanup, and sync reload.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.auth import CurrentUser, RequireAdmin
from src.internal.auth import get_internal_bearer_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


class ActionResponse(BaseModel):
    status: str
    message: str
    details: dict | None = None


class PurgeRequest(BaseModel):
    queue: str = Field(
        description="Stream group to purge: 'executions', 'models', 'memory', or 'all'"
    )


class DlqRetryRequest(BaseModel):
    count: int = Field(5, ge=1, le=100, description="Number of DLQ entries to retry")


@router.post("/actions/worker/restart", dependencies=[RequireAdmin])
async def action_worker_restart(user: CurrentUser) -> ActionResponse:
    """Signal worker to restart (worker monitors this Redis key)."""
    from src.infra.redis import get_redis_client
    r = await get_redis_client()
    if r:
        try:
            await r.set("worker:restart_signal", "1", ex=60)
            return ActionResponse(status="ok", message="Restart signal sent to worker")
        finally:
            await r.aclose()
    return ActionResponse(status="error", message="Redis unavailable")


@router.post("/actions/streams/purge", dependencies=[RequireAdmin])
async def action_purge_streams(body: PurgeRequest, user: CurrentUser) -> ActionResponse:
    """Trim Redis Streams to remove old messages."""
    from src.infra.redis import get_redis_client
    stream_map = {
        "executions": ["tasks:executions"],
        "models": ["tasks:models"],
        "memory": ["memory:raw", "memory:extracted"],
        "all": ["tasks:executions", "tasks:models", "memory:raw", "memory:extracted"],
    }
    streams = stream_map.get(body.queue)
    if not streams:
        raise HTTPException(status_code=400, detail=f"Invalid stream group: {body.queue}")

    r = await get_redis_client()
    if not r:
        return ActionResponse(status="error", message="Redis unavailable")
    try:
        trimmed = {}
        for s in streams:
            length = await r.xlen(s)
            await r.xtrim(s, maxlen=0)
            trimmed[s] = length
        return ActionResponse(
            status="ok",
            message=f"Trimmed {sum(trimmed.values())} messages",
            details=trimmed,
        )
    finally:
        await r.aclose()


@router.post("/actions/dlq/retry", dependencies=[RequireAdmin])
async def action_dlq_retry(body: DlqRetryRequest, user: CurrentUser) -> ActionResponse:
    """Pop entries from DLQ stream and re-publish to original streams."""
    from src.infra.redis import get_redis_client
    r = await get_redis_client()
    if not r:
        return ActionResponse(status="error", message="Redis unavailable")
    try:
        # Read from DLQ stream
        entries = await r.xrange("memory:dlq", count=body.count)
        retried = 0
        for msg_id, data in entries:
            original_stream = data.get("original_stream", "")
            if original_stream:
                await r.xadd(original_stream, {"_retry_from_dlq": "1", **data})
                await r.xdel("memory:dlq", msg_id)
                retried += 1
        return ActionResponse(
            status="ok",
            message=f"Retried {retried} entries",
            details={"retried": retried},
        )
    finally:
        await r.aclose()


@router.post("/actions/dlq/clear", dependencies=[RequireAdmin])
async def action_dlq_clear(user: CurrentUser) -> ActionResponse:
    """Clear the entire dead letter queue."""
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    if not r:
        return ActionResponse(status="error", message="Redis unavailable")

    try:
        count = await r.llen("dead_letter")
        await r.delete("dead_letter")
        return ActionResponse(
            status="ok",
            message=f"Cleared {count} entries from dead letter queue",
            details={"cleared": count},
        )
    finally:
        await r.aclose()


@router.post("/actions/executions/{execution_id}/stop", dependencies=[RequireAdmin])
async def action_stop_execution(
    execution_id: str, user: CurrentUser
) -> ActionResponse:
    """Stop a running execution."""
    from src.infra.database import async_session_maker
    from src.executions.service import ExecutionService

    try:
        async with async_session_maker() as session:
            service = ExecutionService(session)
            success = await service.stop_execution(execution_id)
            if success:
                return ActionResponse(
                    status="ok",
                    message=f"Execution {execution_id} stop signal sent",
                )
            return ActionResponse(
                status="error",
                message=f"Could not stop execution {execution_id}",
            )
    except Exception as e:
        logger.exception("Stop execution failed")
        return ActionResponse(status="error", message="Failed to stop execution")


@router.post("/actions/scheduler/cleanup", dependencies=[RequireAdmin])
async def action_scheduler_cleanup(user: CurrentUser) -> ActionResponse:
    """Clean up stale scheduler slots."""
    from src.executions.scheduler import fair_scheduler

    try:
        cleaned = await fair_scheduler.cleanup_stale_slots()
        return ActionResponse(
            status="ok",
            message=f"Cleaned up {cleaned} stale slot(s)",
            details={"cleaned": cleaned},
        )
    except Exception as e:
        logger.exception("Scheduler cleanup failed")
        return ActionResponse(status="error", message="Scheduler cleanup failed")


@router.post("/actions/sync/reload", dependencies=[RequireAdmin])
async def action_sync_reload(user: CurrentUser) -> ActionResponse:
    """Trigger a config reload from the sync service."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"http://sync-service:8000/api/v1/sync/trigger",
                headers={"Authorization": get_internal_bearer_token()},
            )
            if resp.status_code == 200:
                return ActionResponse(
                    status="ok", message="Sync reload triggered"
                )
            return ActionResponse(
                status="error",
                message=f"Sync service returned {resp.status_code}",
            )
    except Exception as e:
        logger.exception("Sync reload failed")
        return ActionResponse(status="error", message="Sync reload failed")
