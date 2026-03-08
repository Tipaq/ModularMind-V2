"""AutomationRunner — dynamic APScheduler job management for automations.

Reads automation configs from Redis (synced from Platform) and creates/removes
APScheduler jobs dynamically. When a job triggers, it fetches source data,
triages items, and enqueues executions.
"""

import contextlib
import json
import logging
from typing import Any

import redis.asyncio as aioredis
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.graph_engine.interfaces import AutomationConfig
from src.infra.config import get_settings

logger = logging.getLogger(__name__)

JOB_PREFIX = "automation:"


class AutomationRunner:
    """Manages dynamic APScheduler jobs for enabled automations."""

    def __init__(self, scheduler: AsyncIOScheduler):
        self._scheduler = scheduler
        self._active_jobs: dict[str, int] = {}  # automation_id → version

    async def sync_jobs(self) -> None:
        """Diff current jobs vs Redis configs → add/remove/reschedule."""
        settings = get_settings()
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            automation_ids = await r.smembers("automation:ids")
            if not automation_ids:
                # Remove all automation jobs
                for aid in list(self._active_jobs):
                    self._remove_job(aid)
                return

            # Load all configs
            pipe = r.pipeline()
            for aid in automation_ids:
                pipe.get(f"automation:config:{aid}")
            results = await pipe.execute()

            remote_configs: dict[str, AutomationConfig] = {}
            for aid, raw in zip(automation_ids, results, strict=False):
                if raw:
                    try:
                        data = json.loads(raw)
                        remote_configs[aid] = AutomationConfig.model_validate(data)
                    except (json.JSONDecodeError, ValueError):
                        logger.warning("Invalid automation config for %s", aid)

            # Remove jobs for automations that no longer exist or are disabled
            for aid in list(self._active_jobs):
                config = remote_configs.get(aid)
                if not config or not config.enabled:
                    self._remove_job(aid)

            # Add/update jobs for enabled automations
            for aid, config in remote_configs.items():
                if not config.enabled:
                    continue
                existing_version = self._active_jobs.get(aid)
                if existing_version == config.version:
                    continue  # No change
                # Remove old job if version changed
                if existing_version is not None:
                    self._remove_job(aid)
                self._add_job(config)

        finally:
            await r.aclose()

    def _add_job(self, config: AutomationConfig) -> None:
        """Add an APScheduler job for this automation."""
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
                name=f"Automation: {config.name}",
                args=[config.id],
                replace_existing=True,
            )
        elif trigger_type == "manual":
            # Manual-only automations don't get a scheduled job
            pass
        else:
            logger.warning("Unknown trigger type '%s' for automation %s", trigger_type, config.id)
            return

        self._active_jobs[config.id] = config.version
        logger.info(
            "Scheduled automation '%s' (%s) every %ds",
            config.name,
            config.id,
            interval,
        )

    def _remove_job(self, automation_id: str) -> None:
        """Remove the APScheduler job for an automation."""
        job_id = f"{JOB_PREFIX}{automation_id}"
        with contextlib.suppress(Exception):  # Job may not exist
            self._scheduler.remove_job(job_id)
        self._active_jobs.pop(automation_id, None)
        logger.info("Removed automation job: %s", automation_id)

    async def _execute_trigger(self, automation_id: str) -> None:
        """APScheduler callback: fetch source data, triage, enqueue execution."""
        settings = get_settings()
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            raw = await r.get(f"automation:config:{automation_id}")
            if not raw:
                logger.warning("Automation %s config not found in Redis", automation_id)
                return

            config = AutomationConfig.model_validate(json.loads(raw))
            if not config.enabled:
                logger.debug("Automation %s is disabled, skipping", automation_id)
                return

            # Import source handler dynamically
            source_type = config.trigger.get("source", "")
            if source_type == "github_pr":
                from src.automations.sources.github_pr import GitHubPRSource

                source = GitHubPRSource(config)
                items = await source.fetch_new_items()
            else:
                logger.warning("Unknown source type: %s", source_type)
                return

            if not items:
                logger.debug("Automation %s: no new items", automation_id)
                return

            logger.info("Automation %s: found %d new items", automation_id, len(items))

            # Triage and enqueue
            max_per_cycle = config.settings.get("max_per_cycle", 5)
            for item in items[:max_per_cycle]:
                await self._enqueue_item(config, item)

        except Exception:
            logger.exception("Automation trigger failed for %s", automation_id)
        finally:
            await r.aclose()

    async def _enqueue_item(self, config: AutomationConfig, item: dict[str, Any]) -> None:
        """Enqueue an execution for a single source item."""
        from uuid import uuid4

        from src.automations.models import AutomationRun, AutomationRunStatus
        from src.infra.database import async_session_maker
        from src.infra.publish import enqueue_execution

        run_id = str(uuid4())
        source_ref = item.get("source_ref", "")

        # Create run record
        async with async_session_maker() as session:
            run = AutomationRun(
                id=run_id,
                automation_id=config.id,
                status=AutomationRunStatus.PENDING,
                source_type=config.trigger.get("source", ""),
                source_ref=source_ref,
            )
            session.add(run)
            await session.commit()

        # Determine execution target (agent or graph)
        exec_config = config.execution
        agent_id = exec_config.get("agent_id")
        graph_id = exec_config.get("graph_id")

        # Build input data with source context
        input_data: dict[str, Any] = {
            "_automation_id": config.id,
            "_automation_run_id": run_id,
            **item,
        }

        target_id = graph_id or agent_id
        if not target_id:
            logger.error("Automation %s has no execution target", config.id)
            return

        await enqueue_execution(
            target_id=target_id,
            input_text=item.get("prompt", f"Process: {source_ref}"),
            input_data=input_data,
            user_id="",  # Headless execution
        )
        logger.info(
            "Enqueued execution for automation %s, run %s, target %s",
            config.id,
            run_id,
            target_id,
        )
