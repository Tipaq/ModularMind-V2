"""APScheduler setup — replaces Celery Beat for periodic tasks.

Configures interval and cron jobs for:
- Platform sync polling (every SYNC_INTERVAL_SECONDS)
- Memory consolidation (daily)
- Metrics reporting (every 60s)
- Stale execution cleanup (every 5min)
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.infra.config import settings

logger = logging.getLogger(__name__)


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler instance."""
    scheduler = AsyncIOScheduler()

    # Platform sync — poll for config changes
    if settings.PLATFORM_URL:
        scheduler.add_job(
            sync_platform,
            "interval",
            seconds=settings.SYNC_INTERVAL_SECONDS,
            id="sync_platform",
            name="Poll platform for config updates",
        )

    # TODO: Add more periodic jobs:
    # - Memory consolidation (daily at 3am)
    # - Metrics flush (every 60s)
    # - Stale execution cleanup (every 5min)
    # - MCP sidecar health check (every 2min)

    return scheduler


async def sync_platform() -> None:
    """Poll platform for manifest changes and apply updates."""
    # TODO: Implement — delegates to src.sync.service
    logger.debug("Polling platform for config updates")
