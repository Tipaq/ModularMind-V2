"""ScheduledTaskRunner — dynamic APScheduler job management for scheduled tasks.

Reads scheduled task configs from the engine DB and creates/removes
APScheduler jobs dynamically. When a job triggers, it fetches source data,
triages items, and enqueues executions.
"""

import contextlib
import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from src.infra.database import async_session_maker
from src.scheduled_tasks.models import ScheduledTask
from src.scheduled_tasks.schemas import interval_to_seconds

logger = logging.getLogger(__name__)

JOB_PREFIX = "scheduled_task:"


class ScheduledTaskRunner:
    """Manages dynamic APScheduler jobs for enabled scheduled tasks."""

    def __init__(self, scheduler: AsyncIOScheduler):
        self._scheduler = scheduler
        self._active_jobs: dict[str, int] = {}

    async def sync_jobs(self) -> None:
        """Diff current jobs vs DB configs — add/remove/reschedule."""
        async with async_session_maker() as session:
            result = await session.execute(select(ScheduledTask))
            all_tasks = list(result.scalars().all())

        task_map: dict[str, ScheduledTask] = {t.id: t for t in all_tasks}

        for task_id in list(self._active_jobs):
            task = task_map.get(task_id)
            if not task or not task.enabled:
                self._remove_job(task_id)

        for task_id, task in task_map.items():
            if not task.enabled:
                continue
            existing_version = self._active_jobs.get(task_id)
            if existing_version == task.version:
                continue
            if existing_version is not None:
                self._remove_job(task_id)
            self._add_job(task)

    def _add_job(self, task: ScheduledTask) -> None:
        """Add an APScheduler job for this scheduled task."""
        job_id = f"{JOB_PREFIX}{task.id}"

        if task.schedule_type == "interval":
            if not task.interval_value or not task.interval_unit:
                logger.warning("Interval task %s missing value/unit", task.id)
                return
            seconds = interval_to_seconds(task.interval_value, task.interval_unit)
            self._scheduler.add_job(
                self._execute_trigger,
                "interval",
                seconds=seconds,
                id=job_id,
                name=f"ScheduledTask: {task.name}",
                args=[task.id],
                replace_existing=True,
            )
            logger.info(
                "Scheduled task '%s' every %d %s",
                task.name, task.interval_value, task.interval_unit,
            )
        elif task.schedule_type == "one_shot":
            if not task.scheduled_at:
                logger.warning("One-shot task %s missing scheduled_at", task.id)
                return
            self._scheduler.add_job(
                self._execute_trigger,
                "date",
                run_date=task.scheduled_at,
                id=job_id,
                name=f"ScheduledTask: {task.name}",
                args=[task.id],
                replace_existing=True,
            )
            logger.info(
                "Scheduled task '%s' at %s", task.name, task.scheduled_at,
            )
        elif task.schedule_type == "manual":
            pass
        else:
            logger.warning("Unknown schedule_type '%s' for task %s", task.schedule_type, task.id)
            return

        self._active_jobs[task.id] = task.version

    def _remove_job(self, task_id: str) -> None:
        """Remove the APScheduler job for a scheduled task."""
        job_id = f"{JOB_PREFIX}{task_id}"
        with contextlib.suppress(Exception):
            self._scheduler.remove_job(job_id)
        self._active_jobs.pop(task_id, None)
        logger.info("Removed scheduled task job: %s", task_id)

    async def _execute_trigger(self, task_id: str) -> None:
        """APScheduler callback: fetch source data, triage, enqueue."""
        from src.infra.utils import utcnow

        try:
            async with async_session_maker() as session:
                result = await session.execute(
                    select(ScheduledTask).where(ScheduledTask.id == task_id)
                )
                task = result.scalar_one_or_none()

            if not task or not task.enabled:
                return

            # Check if task has a source handler (e.g. GitHub PRs)
            config = task.config or {}
            source_type = config.get("trigger", {}).get("source", "")

            if source_type == "github_pr":
                await self._execute_source_trigger(task, config)
            elif task.target_id:
                await self._execute_direct(task)
            else:
                logger.warning("Task %s has no target or source", task_id)
                return

            # Update last_run_at
            async with async_session_maker() as session:
                result = await session.execute(
                    select(ScheduledTask).where(ScheduledTask.id == task_id)
                )
                db_task = result.scalar_one_or_none()
                if db_task:
                    db_task.last_run_at = utcnow()
                    # Disable one-shot tasks after execution
                    if db_task.schedule_type == "one_shot":
                        db_task.enabled = False
                    await session.commit()

        except Exception:
            logger.exception("Scheduled task trigger failed for %s", task_id)

    async def _execute_direct(self, task: ScheduledTask) -> None:
        """Enqueue a direct execution (no source handler)."""
        from uuid import uuid4

        from src.infra.publish import enqueue_execution
        from src.scheduled_tasks.models import ScheduledTaskRun, ScheduledTaskRunStatus

        run_id = str(uuid4())
        async with async_session_maker() as session:
            run = ScheduledTaskRun(
                id=run_id,
                scheduled_task_id=task.id,
                status=ScheduledTaskRunStatus.PENDING,
                source_type="direct",
                source_ref="",
            )
            session.add(run)
            await session.commit()

        input_data: dict[str, Any] = {
            "_scheduled_task_id": task.id,
            "_scheduled_task_run_id": run_id,
        }

        await enqueue_execution(
            target_id=task.target_id or "",
            input_text=task.input_text or f"Execute scheduled task: {task.name}",
            input_data=input_data,
            user_id="",
        )
        logger.info("Enqueued direct execution for task %s, run %s", task.id, run_id)

    async def _execute_source_trigger(
        self, task: ScheduledTask, config: dict[str, Any],
    ) -> None:
        """Execute trigger with a source handler (e.g. GitHub PRs)."""
        from src.scheduled_tasks.schemas import ScheduledTaskConfig

        task_config = ScheduledTaskConfig(
            id=task.id,
            name=task.name,
            description=task.description,
            enabled=task.enabled,
            schedule_type=task.schedule_type,
            target_type=task.target_type,
            target_id=task.target_id,
            input_text=task.input_text,
            config=config,
            version=task.version,
            tags=task.tags or [],
        )

        source_type = config.get("trigger", {}).get("source", "")
        if source_type == "github_pr":
            from src.scheduled_tasks.sources.github_pr import GitHubPRSource

            source = GitHubPRSource(task_config)
            items = await source.fetch_new_items()
        else:
            logger.warning("Unknown source type: %s", source_type)
            return

        if not items:
            logger.debug("Task %s: no new items", task.id)
            return

        logger.info("Task %s: found %d new items", task.id, len(items))

        max_per_cycle = config.get("settings", {}).get("max_per_cycle", 5)
        for item in items[:max_per_cycle]:
            await self._enqueue_source_item(task, task_config, item)

    async def _enqueue_source_item(
        self,
        task: ScheduledTask,
        config: ScheduledTaskConfig,
        item: dict[str, Any],
    ) -> None:
        """Enqueue an execution for a single source item."""
        from uuid import uuid4

        from src.infra.publish import enqueue_execution
        from src.scheduled_tasks.models import ScheduledTaskRun, ScheduledTaskRunStatus

        run_id = str(uuid4())
        source_ref = item.get("source_ref", "")

        async with async_session_maker() as session:
            run = ScheduledTaskRun(
                id=run_id,
                scheduled_task_id=task.id,
                status=ScheduledTaskRunStatus.PENDING,
                source_type=config.config.get("trigger", {}).get("source", ""),
                source_ref=source_ref,
            )
            session.add(run)
            await session.commit()

        target_id = task.target_id
        if not target_id:
            logger.error("Task %s has no execution target", task.id)
            return

        input_data: dict[str, Any] = {
            "_scheduled_task_id": task.id,
            "_scheduled_task_run_id": run_id,
            **item,
        }

        await enqueue_execution(
            target_id=target_id,
            input_text=item.get("prompt", f"Process: {source_ref}"),
            input_data=input_data,
            user_id="",
        )
        logger.info("Enqueued execution for task %s, run %s", task.id, run_id)
