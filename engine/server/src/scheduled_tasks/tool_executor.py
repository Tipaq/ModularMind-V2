"""ScheduledTaskToolExecutor — routes scheduled_task__ tool calls to local service.

Matches MCPToolExecutor.execute(name, args) -> str interface.
Calls the local service layer directly (no Platform proxy needed).
"""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

SCHEDULED_TASK_TOOL_PREFIX = "scheduled_task__"


class ScheduledTaskToolExecutor:
    """Executes scheduled task tool calls via local service."""

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        action = name.removeprefix(SCHEDULED_TASK_TOOL_PREFIX)
        try:
            handler = getattr(self, f"_handle_{action}", None)
            if not handler:
                return json.dumps({"error": f"Unknown tool: {name}"})
            return await handler(args)
        except Exception as e:
            logger.exception("Scheduled task tool %s failed", name)
            return json.dumps({"error": str(e)})

    async def _handle_list(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskResponse

        result = await service.list_tasks(search=args.get("search", ""))
        items = [ScheduledTaskResponse.model_validate(t).model_dump(mode="json") for t in result["items"]]
        return json.dumps({"items": items, "total": result["total"]})

    async def _handle_get(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskResponse

        task = await service.get_task(args["id"])
        if not task:
            return json.dumps({"error": "Not found"})
        return ScheduledTaskResponse.model_validate(task).model_dump_json()

    async def _handle_create(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskCreate, ScheduledTaskResponse

        data = ScheduledTaskCreate(
            name=args["name"],
            description=args.get("description", ""),
            config=args.get("config", {}),
            tags=args.get("tags", []),
        )
        task = await service.create_task(data)
        return ScheduledTaskResponse.model_validate(task).model_dump_json()

    async def _handle_update(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskResponse, ScheduledTaskUpdate

        task_id = args.pop("id")
        data = ScheduledTaskUpdate(**{k: v for k, v in args.items() if v is not None})
        task = await service.update_task(task_id, data)
        if not task:
            return json.dumps({"error": "Not found"})
        return ScheduledTaskResponse.model_validate(task).model_dump_json()

    async def _handle_toggle(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskResponse, ScheduledTaskUpdate

        data = ScheduledTaskUpdate(enabled=args["enabled"])
        task = await service.update_task(args["id"], data)
        if not task:
            return json.dumps({"error": "Not found"})
        return ScheduledTaskResponse.model_validate(task).model_dump_json()

    async def _handle_delete(self, args: dict) -> str:
        from src.scheduled_tasks import service

        deleted = await service.delete_task(args["id"])
        if not deleted:
            return json.dumps({"error": "Not found"})
        return json.dumps({"ok": True})

    async def _handle_runs(self, args: dict) -> str:
        from src.scheduled_tasks import service
        from src.scheduled_tasks.schemas import ScheduledTaskRunResponse

        runs = await service.get_task_runs(args["id"], limit=args.get("limit", 10))
        items = [ScheduledTaskRunResponse.model_validate(r).model_dump(mode="json") for r in runs]
        return json.dumps({"runs": items})

    async def _handle_trigger(self, args: dict) -> str:
        import redis.asyncio as aioredis

        from src.infra.config import get_settings
        from src.infra.stream_names import STREAM_SCHEDULED_TASK_TRIGGER

        settings = get_settings()
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await r.xadd(
                STREAM_SCHEDULED_TASK_TRIGGER,
                {"scheduled_task_id": args["id"]},
            )
        finally:
            await r.aclose()
        return json.dumps({"status": "triggered", "scheduled_task_id": args["id"]})
