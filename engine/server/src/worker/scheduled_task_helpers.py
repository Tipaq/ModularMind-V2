"""Helpers for updating ScheduledTaskRun after execution completion."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import sqlalchemy.exc

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _extract_scheduled_task_ids(
    input_data: dict[str, Any] | None,
) -> tuple[str, str] | None:
    """Extract (task_id, run_id) from execution input_data, or None."""
    if not input_data:
        return None
    task_id = input_data.get("_scheduled_task_id", "")
    run_id = input_data.get("_scheduled_task_run_id", "")
    if not task_id or not run_id:
        return None
    return task_id, run_id


async def update_scheduled_task_run(
    execution_id: str,
    status: str,
    complete_event: dict[str, Any] | None = None,
    error_message: str = "",
) -> None:
    """Update the ScheduledTaskRun linked to this execution."""
    from sqlalchemy import select as sa_select

    from src.executions.models import ExecutionRun
    from src.infra.database import async_session_maker

    try:
        async with async_session_maker() as session:
            result = await session.execute(
                sa_select(ExecutionRun.input_data).where(
                    ExecutionRun.id == execution_id,
                )
            )
            row = result.first()
            ids = _extract_scheduled_task_ids(row[0] if row else None)
            if not ids:
                return
            task_id, run_id = ids

        from src.infra.utils import utcnow
        from src.scheduled_tasks.models import (
            ScheduledTaskRun,
            ScheduledTaskRunStatus,
        )

        status_map = {
            "completed": ScheduledTaskRunStatus.COMPLETED,
            "failed": ScheduledTaskRunStatus.FAILED,
            "skipped": ScheduledTaskRunStatus.SKIPPED,
        }
        run_status = status_map.get(status, ScheduledTaskRunStatus.FAILED)

        async with async_session_maker() as hook_session:
            run_result = await hook_session.execute(
                sa_select(ScheduledTaskRun).where(ScheduledTaskRun.id == run_id)
            )
            run = run_result.scalar_one_or_none()
            if not run:
                return

            now = utcnow()
            run.status = run_status
            run.execution_id = execution_id
            run.completed_at = now
            run.error_message = error_message

            if status == "completed":
                output = (complete_event or {}).get("output", {})
                summary = ""
                if isinstance(output, dict):
                    summary = output.get("response", "")
                run.result_summary = summary[:2000]

            if run.created_at:
                run.duration_seconds = (now - run.created_at).total_seconds()

            await hook_session.commit()

            if status == "completed":
                await _run_post_hooks(hook_session, task_id, run)

    except (sqlalchemy.exc.SQLAlchemyError, KeyError, ValueError, OSError):
        logger.exception(
            "Failed to update scheduled task run for execution %s",
            execution_id,
        )


async def _run_post_hooks(
    session: AsyncSession,
    task_id: str,
    run: Any,
) -> None:
    """Run post-action hooks (webhooks, GitHub comments, etc.)."""
    from sqlalchemy import select as sa_select

    from src.infra.database import async_session_maker
    from src.scheduled_tasks.hooks import run_post_actions
    from src.scheduled_tasks.models import ScheduledTask
    from src.scheduled_tasks.schemas import ScheduledTaskConfig

    async with async_session_maker() as hook_session:
        task_result = await hook_session.execute(
            sa_select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        task = task_result.scalar_one_or_none()
        if not task:
            return

        config = ScheduledTaskConfig(
            id=task.id,
            name=task.name,
            description=task.description,
            enabled=task.enabled,
            schedule_type=task.schedule_type,
            target_type=task.target_type,
            target_id=task.target_id,
            input_text=task.input_text,
            config=task.config or {},
            version=task.version,
            tags=task.tags or [],
        )

        execution_result = {
            "summary": run.result_summary or "",
            "content": run.result_summary or "",
        }
        await run_post_actions(config, run, execution_result)
