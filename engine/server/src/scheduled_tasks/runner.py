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
from src.scheduled_tasks.schemas import ScheduledTaskConfig

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

        remote_configs: dict[str, ScheduledTaskConfig] = {}
        for task in all_tasks:
            config = self._task_to_config(task)
            remote_configs[task.id] = config

        for task_id in list(self._active_jobs):
            config = remote_configs.get(task_id)
            if not config or not config.enabled:
                self._remove_job(task_id)

        for task_id, config in remote_configs.items():
            if not config.enabled:
                continue
            existing_version = self._active_jobs.get(task_id)
            if existing_version == config.version:
                continue
            if existing_version is not None:
                self._remove_job(task_id)
            self._add_job(config)

    def _task_to_config(self, task: ScheduledTask) -> ScheduledTaskConfig:
        """Convert a DB model to a ScheduledTaskConfig."""
        config_data = task.config or {}
        return ScheduledTaskConfig(
            id=task.id,
            name=task.name,
            description=task.description,
            enabled=task.enabled,
            trigger=config_data.get("trigger", {}),
            triage=config_data.get("triage"),
            execution=config_data.get("execution", {}),
            post_actions=config_data.get("post_actions", []),
            settings=config_data.get("settings", {}),
            version=task.version,
            tags=task.tags or [],
        )

    def _add_job(self, config: ScheduledTaskConfig) -> None:
        """Add an APScheduler job for this scheduled task."""
        trigger_config = config.trigger
        trigger_type = trigger_config.get("type", "cron")
        interval = trigger_config.get("interval_seconds", 3600)
        job_id = f"{JOB_PREFIX}{config.id}"

        if trigger_type == "cron":
            self._scheduler.add_job(
                self._execute_trigger,
                "interval",
                seconds=interval,
                id=job_id,
                name=f"ScheduledTask: {config.name}",
                args=[config.id],
                replace_existing=True,
            )
        elif trigger_type == "manual":
            pass
        else:
            logger.warning(
                "Unknown trigger type '%s' for task %s", trigger_type, config.id,
            )
            return

        self._active_jobs[config.id] = config.version
        logger.info(
            "Scheduled task '%s' (%s) every %ds", config.name, config.id, interval,
        )

    def _remove_job(self, task_id: str) -> None:
        """Remove the APScheduler job for a scheduled task."""
        job_id = f"{JOB_PREFIX}{task_id}"
        with contextlib.suppress(Exception):
            self._scheduler.remove_job(job_id)
        self._active_jobs.pop(task_id, None)
        logger.info("Removed scheduled task job: %s", task_id)

    async def _execute_trigger(self, task_id: str) -> None:
        """APScheduler callback: fetch source data, triage, enqueue."""
        try:
            async with async_session_maker() as session:
                result = await session.execute(
                    select(ScheduledTask).where(ScheduledTask.id == task_id)
                )
                task = result.scalar_one_or_none()

            if not task:
                logger.warning("Scheduled task %s not found in DB", task_id)
                return

            config = self._task_to_config(task)
            if not config.enabled:
                logger.debug("Scheduled task %s is disabled, skipping", task_id)
                return

            source_type = config.trigger.get("source", "")
            if source_type == "github_pr":
                from src.scheduled_tasks.sources.github_pr import GitHubPRSource

                source = GitHubPRSource(config)
                items = await source.fetch_new_items()
            else:
                logger.warning("Unknown source type: %s", source_type)
                return

            if not items:
                logger.debug("Scheduled task %s: no new items", task_id)
                return

            logger.info("Scheduled task %s: found %d new items", task_id, len(items))

            max_per_cycle = config.settings.get("max_per_cycle", 5)
            for item in items[:max_per_cycle]:
                await self._enqueue_item(config, item)

        except Exception:
            logger.exception("Scheduled task trigger failed for %s", task_id)

    async def _enqueue_item(
        self, config: ScheduledTaskConfig, item: dict[str, Any],
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
                scheduled_task_id=config.id,
                status=ScheduledTaskRunStatus.PENDING,
                source_type=config.trigger.get("source", ""),
                source_ref=source_ref,
            )
            session.add(run)
            await session.commit()

        exec_config = config.execution
        agent_id = exec_config.get("agent_id")
        graph_id = exec_config.get("graph_id")

        input_data: dict[str, Any] = {
            "_scheduled_task_id": config.id,
            "_scheduled_task_run_id": run_id,
            **item,
        }

        target_id = graph_id or agent_id
        if not target_id:
            logger.error("Scheduled task %s has no execution target", config.id)
            return

        await enqueue_execution(
            target_id=target_id,
            input_text=item.get("prompt", f"Process: {source_ref}"),
            input_data=input_data,
            user_id="",
        )
        logger.info(
            "Enqueued execution for task %s, run %s, target %s",
            config.id, run_id, target_id,
        )
