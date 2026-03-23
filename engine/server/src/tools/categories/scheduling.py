"""Scheduling tool category — create, manage, and monitor scheduled tasks.

Available when agent has tool_categories.scheduling = true.
Tools: create_cron, update_cron, delete_cron, list_crons, get_cron_journal, trigger_cron.
"""

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


def get_scheduling_tool_definitions() -> list[dict[str, Any]]:
    """Return OpenAI-compatible tool definitions for scheduling category."""
    return [
        _tool(
            "scheduling_create_cron",
            (
                "Create a new scheduled task. Specify when it should run "
                "(interval or one-shot) and what agent or graph to execute."
            ),
            {
                "name": {"type": "string", "description": "Name of the task."},
                "description": {"type": "string", "description": "Description."},
                "schedule_type": {
                    "type": "string",
                    "enum": ["interval", "one_shot", "manual"],
                    "description": "How the task is scheduled.",
                },
                "interval_value": {
                    "type": "integer",
                    "description": "Interval value (e.g. 1 for 'every 1 hour').",
                },
                "interval_unit": {
                    "type": "string",
                    "enum": ["minutes", "hours", "days"],
                    "description": "Interval unit.",
                },
                "scheduled_at": {
                    "type": "string",
                    "description": "ISO datetime for one-shot (e.g. '2026-04-01T10:00:00').",
                },
                "target_type": {
                    "type": "string",
                    "enum": ["agent", "graph"],
                    "description": "Execute an agent or a graph.",
                },
                "target_id": {
                    "type": "string",
                    "description": "ID of the agent or graph to execute.",
                },
                "input_text": {
                    "type": "string",
                    "description": "Prompt or instruction for the execution.",
                },
            },
            ["name", "schedule_type"],
        ),
        _tool(
            "scheduling_update_cron",
            "Update an existing scheduled task. Only provided fields are changed.",
            {
                "id": {"type": "string", "description": "Task ID to update."},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "enabled": {"type": "boolean"},
                "schedule_type": {"type": "string", "enum": ["interval", "one_shot", "manual"]},
                "interval_value": {"type": "integer"},
                "interval_unit": {"type": "string", "enum": ["minutes", "hours", "days"]},
                "scheduled_at": {"type": "string"},
                "target_type": {"type": "string", "enum": ["agent", "graph"]},
                "target_id": {"type": "string"},
                "input_text": {"type": "string"},
            },
            ["id"],
        ),
        _tool(
            "scheduling_delete_cron",
            "Delete a scheduled task by ID.",
            {"id": {"type": "string", "description": "Task ID to delete."}},
            ["id"],
        ),
        _tool(
            "scheduling_list_crons",
            "List all scheduled tasks with their status and schedule info.",
            {"search": {"type": "string", "description": "Optional name filter."}},
            [],
        ),
        _tool(
            "scheduling_get_cron_journal",
            "Get the execution history (journal) of a scheduled task.",
            {
                "id": {"type": "string", "description": "Task ID."},
                "limit": {"type": "integer", "description": "Max entries (default 10)."},
            },
            ["id"],
        ),
        _tool(
            "scheduling_trigger_cron",
            "Manually trigger a scheduled task to run immediately.",
            {"id": {"type": "string", "description": "Task ID to trigger."}},
            ["id"],
        ),
    ]


async def execute_scheduling_tool(
    name: str,
    args: dict[str, Any],
    user_id: str,
    agent_id: str,
    session: AsyncSession,
) -> str:
    """Dispatch a scheduling tool call to the appropriate handler."""
    if name == "scheduling_create_cron":
        return await _create_cron(args)
    if name == "scheduling_update_cron":
        return await _update_cron(args)
    if name == "scheduling_delete_cron":
        return await _delete_cron(args)
    if name == "scheduling_list_crons":
        return await _list_crons(args)
    if name == "scheduling_get_cron_journal":
        return await _get_cron_journal(args)
    if name == "scheduling_trigger_cron":
        return await _trigger_cron(args)
    return json.dumps({"error": f"Unknown scheduling tool: {name}"})


async def _create_cron(args: dict) -> str:
    from src.scheduled_tasks import service
    from src.scheduled_tasks.schemas import ScheduledTaskCreate, ScheduledTaskResponse

    data = ScheduledTaskCreate(
        name=args["name"],
        description=args.get("description", ""),
        schedule_type=args.get("schedule_type", "manual"),
        interval_value=args.get("interval_value"),
        interval_unit=args.get("interval_unit"),
        scheduled_at=args.get("scheduled_at"),
        target_type=args.get("target_type", "agent"),
        target_id=args.get("target_id"),
        input_text=args.get("input_text", ""),
    )
    task = await service.create_task(data)
    return ScheduledTaskResponse.model_validate(task).model_dump_json()


async def _update_cron(args: dict) -> str:
    from src.scheduled_tasks import service
    from src.scheduled_tasks.schemas import ScheduledTaskResponse, ScheduledTaskUpdate

    task_id = args.pop("id")
    data = ScheduledTaskUpdate(**{k: v for k, v in args.items() if v is not None})
    task = await service.update_task(task_id, data)
    if not task:
        return json.dumps({"error": "Not found"})
    return ScheduledTaskResponse.model_validate(task).model_dump_json()


async def _delete_cron(args: dict) -> str:
    from src.scheduled_tasks import service

    deleted = await service.delete_task(args["id"])
    if not deleted:
        return json.dumps({"error": "Not found"})
    return json.dumps({"ok": True})


async def _list_crons(args: dict) -> str:
    from src.scheduled_tasks import service
    from src.scheduled_tasks.schemas import ScheduledTaskResponse

    result = await service.list_tasks(search=args.get("search", ""))
    items = [
        ScheduledTaskResponse.model_validate(t).model_dump(mode="json") for t in result["items"]
    ]
    return json.dumps({"items": items, "total": result["total"]})


async def _get_cron_journal(args: dict) -> str:
    from src.scheduled_tasks import service
    from src.scheduled_tasks.schemas import ScheduledTaskRunResponse

    runs = await service.get_task_runs(args["id"], limit=args.get("limit", 10))
    items = [ScheduledTaskRunResponse.model_validate(r).model_dump(mode="json") for r in runs]
    return json.dumps({"runs": items})


async def _trigger_cron(args: dict) -> str:
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
