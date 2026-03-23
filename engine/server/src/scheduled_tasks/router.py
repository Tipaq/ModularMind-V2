"""FastAPI router for scheduled task CRUD and operations."""

import logging

from fastapi import APIRouter, HTTPException, Query

from src.scheduled_tasks import service
from src.scheduled_tasks.schemas import (
    ScheduledTaskCreate,
    ScheduledTaskResponse,
    ScheduledTaskRunResponse,
    ScheduledTaskUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scheduled-tasks", tags=["scheduled-tasks"])


async def _notify_runner() -> None:
    """Notify the runner to resync jobs after a mutation."""
    from src.worker.scheduler import get_scheduled_task_runner

    runner = get_scheduled_task_runner()
    if runner:
        try:
            await runner.sync_jobs()
        except Exception:
            logger.exception("Failed to sync scheduled task jobs")


@router.get("/")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""),
) -> dict:
    result = await service.list_tasks(search=search, page=page, page_size=page_size)
    result["items"] = [ScheduledTaskResponse.model_validate(t) for t in result["items"]]
    return result


@router.post("/", status_code=201)
async def create_task(data: ScheduledTaskCreate) -> ScheduledTaskResponse:
    task = await service.create_task(data)
    await _notify_runner()
    return ScheduledTaskResponse.model_validate(task)


@router.get("/{task_id}")
async def get_task(task_id: str) -> ScheduledTaskResponse:
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return ScheduledTaskResponse.model_validate(task)


@router.patch("/{task_id}")
async def update_task(task_id: str, data: ScheduledTaskUpdate) -> ScheduledTaskResponse:
    task = await service.update_task(task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    await _notify_runner()
    return ScheduledTaskResponse.model_validate(task)


@router.delete("/{task_id}")
async def delete_task(task_id: str) -> dict:
    deleted = await service.delete_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    await _notify_runner()
    return {"ok": True}


@router.post("/{task_id}/trigger")
async def trigger_task(task_id: str) -> dict:
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    import redis.asyncio as aioredis

    from src.infra.config import get_settings
    from src.infra.stream_names import STREAM_SCHEDULED_TASK_TRIGGER

    settings = get_settings()
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.xadd(
            STREAM_SCHEDULED_TASK_TRIGGER,
            {"scheduled_task_id": task_id},
        )
    finally:
        await r.aclose()

    return {"status": "triggered", "scheduled_task_id": task_id}


@router.get("/{task_id}/runs")
async def get_task_runs(
    task_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[ScheduledTaskRunResponse]:
    runs = await service.get_task_runs(task_id, limit=limit, offset=offset)
    return [ScheduledTaskRunResponse.model_validate(r) for r in runs]


@router.post("/{task_id}/duplicate", status_code=201)
async def duplicate_task(task_id: str) -> ScheduledTaskResponse:
    task = await service.duplicate_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return ScheduledTaskResponse.model_validate(task)
