"""
Internal action endpoints.

Admin actions for worker management, DLQ operations,
execution control, scheduler cleanup, and sync reload.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.auth import CurrentUser, RequireAdmin
from src.infra.schemas import ActionResponse as _BaseActionResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


class ActionResponse(_BaseActionResponse):
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

    from src.infra.stream_names import (
        STREAM_EXECUTIONS,
        STREAM_MEMORY_EXTRACTED,
        STREAM_MEMORY_RAW,
        STREAM_MODELS,
    )

    stream_map = {
        "executions": [STREAM_EXECUTIONS],
        "models": [STREAM_MODELS],
        "memory": [STREAM_MEMORY_RAW, STREAM_MEMORY_EXTRACTED],
        "all": [STREAM_EXECUTIONS, STREAM_MODELS, STREAM_MEMORY_RAW, STREAM_MEMORY_EXTRACTED],
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
        # Read from DLQ stream and batch re-publish via pipeline
        entries = await r.xrange("pipeline:dlq", count=body.count)
        to_retry = [(msg_id, data) for msg_id, data in entries if data.get("original_stream")]
        if to_retry:
            pipe = r.pipeline()
            for msg_id, data in to_retry:
                pipe.xadd(data["original_stream"], {"_retry_from_dlq": "1", **data})
                pipe.xdel("pipeline:dlq", msg_id)
            await pipe.execute()
        return ActionResponse(
            status="ok",
            message=f"Retried {len(to_retry)} entries",
            details={"retried": len(to_retry)},
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
async def action_stop_execution(execution_id: str, user: CurrentUser) -> ActionResponse:
    """Stop a running execution."""
    from src.executions.service import ExecutionService
    from src.infra.database import async_session_maker

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
    except Exception:
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
    except Exception:
        logger.exception("Scheduler cleanup failed")
        return ActionResponse(status="error", message="Scheduler cleanup failed")


@router.post("/actions/redis/cleanup", dependencies=[RequireAdmin])
async def action_redis_cleanup(user: CurrentUser) -> ActionResponse:
    """Clean up stale Redis keys from executions, approvals, and scheduler.

    Removes:
    - exec_stream:* (stale execution SSE streams)
    - approval_decision:* / approval_node:* (stale approval gates)
    - revoke_intent:* (stale cancellation signals)
    - scheduler:slot:* / scheduler:global / scheduler:team:* / scheduler:active_slots
    """
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    if not r:
        return ActionResponse(status="error", message="Redis unavailable")
    try:
        cleaned: dict[str, int] = {}
        patterns = [
            "exec_stream:*",
            "approval_decision:*",
            "approval_node:*",
            "revoke_intent:*",
            "scheduler:slot:*",
            "scheduler:team:*",
        ]
        for pattern in patterns:
            keys = []
            async for key in r.scan_iter(match=pattern, count=500):
                keys.append(key)
            if keys:
                await r.delete(*keys)
            cleaned[pattern] = len(keys)

        # Also reset the global counter and active slots set
        for fixed_key in ["scheduler:global", "scheduler:active_slots"]:
            exists = await r.exists(fixed_key)
            if exists:
                await r.delete(fixed_key)
                cleaned[fixed_key] = 1
            else:
                cleaned[fixed_key] = 0

        total = sum(cleaned.values())
        return ActionResponse(
            status="ok",
            message=f"Cleaned {total} Redis key(s)",
            details=cleaned,
        )
    finally:
        await r.aclose()


@router.post("/actions/executions/stop-all", dependencies=[RequireAdmin])
async def action_stop_all_executions(user: CurrentUser) -> ActionResponse:
    """Stop all running/pending executions and clean their Redis state."""
    from sqlalchemy import select, update

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import async_session_maker
    from src.infra.redis import get_redis_client

    try:
        stopped_count = 0
        async with async_session_maker() as session:
            result = await session.execute(
                select(ExecutionRun.id).where(
                    ExecutionRun.status.in_([
                        ExecutionStatus.RUNNING,
                        ExecutionStatus.PENDING,
                        ExecutionStatus.AWAITING_APPROVAL,
                    ])
                )
            )
            exec_ids = [row[0] for row in result.all()]

            if exec_ids:
                # Set revoke intents in Redis
                r = await get_redis_client()
                if r:
                    try:
                        pipe = r.pipeline()
                        for eid in exec_ids:
                            pipe.set(f"revoke_intent:{eid}", "cancel", ex=300)
                        await pipe.execute()
                    finally:
                        await r.aclose()

                # Mark all as stopped in DB
                await session.execute(
                    update(ExecutionRun)
                    .where(ExecutionRun.id.in_(exec_ids))
                    .values(status=ExecutionStatus.STOPPED)
                )
                await session.commit()
                stopped_count = len(exec_ids)

        return ActionResponse(
            status="ok",
            message=f"Stopped {stopped_count} execution(s)",
            details={
                "stopped": stopped_count,
                "execution_ids": exec_ids if stopped_count > 0 else [],
            },
        )
    except Exception:
        logger.exception("Stop all executions failed")
        return ActionResponse(status="error", message="Failed to stop executions")


@router.post("/actions/sync/reload", dependencies=[RequireAdmin])
async def action_sync_reload(user: CurrentUser) -> ActionResponse:
    """Trigger a config reload from the platform."""
    try:
        from src.sync.service import SyncService

        svc = SyncService()
        await svc.initialize()
        try:
            updated = await svc.poll()
            if updated:
                return ActionResponse(status="ok", message="Config updated from platform")
            return ActionResponse(status="ok", message="Already up to date")
        finally:
            await svc.close()
    except Exception:
        logger.exception("Sync reload failed")
        return ActionResponse(status="error", message="Sync reload failed")
