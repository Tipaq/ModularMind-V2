"""APScheduler setup for periodic tasks.

Configures interval and cron jobs for:
- Platform sync polling (every SYNC_INTERVAL_SECONDS)
- Report to platform (every 15 minutes)
- Stale execution cleanup (every 5 minutes)
- Memory consolidation (every 6 hours, Phase 5)
"""

import logging
from datetime import UTC

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

        # Report metrics to platform
        scheduler.add_job(
            report_to_platform,
            "interval",
            seconds=900,
            id="report_to_platform",
            name="Report metrics to platform",
        )

    # Stale execution cleanup
    scheduler.add_job(
        cleanup_stale_executions,
        "interval",
        seconds=300,
        id="cleanup_stale_executions",
        name="Cleanup stuck executions",
    )

    # Memory consolidation — merge duplicates, decay old entries
    if settings.FACT_EXTRACTION_ENABLED:
        scheduler.add_job(
            memory_consolidation,
            "cron",
            hour="*/6",
            id="memory_consolidation",
            name="Consolidate memory entries",
        )

    return scheduler


async def sync_platform() -> None:
    """Poll platform for manifest changes and apply updates."""
    from src.sync.service import SyncService

    svc = SyncService()
    await svc.initialize()
    try:
        updated = await svc.poll()
        if updated:
            logger.info("Config updated from platform")
    except Exception:
        logger.exception("Platform sync failed")
    finally:
        await svc.close()


async def report_to_platform() -> None:
    """POST metrics to {PLATFORM_URL}/api/reports."""
    import httpx

    from src.report.service import ReportService

    svc = ReportService()
    payload = {
        "status": await svc.get_status(),
        "metrics": await svc.get_metrics(),
        "models": await svc.get_models(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{settings.PLATFORM_URL}/api/reports",
                json=payload,
                headers={"X-Engine-Key": settings.ENGINE_API_KEY},
            )
    except Exception:
        logger.exception("Failed to report to platform")


async def memory_consolidation() -> None:
    """Consolidate memory entries — merge redundant facts, apply decay, prune low-importance."""
    from datetime import datetime, timedelta

    from sqlalchemy import delete, update

    from src.infra.database import async_session_maker
    from src.memory.models import MemoryEntry

    _DECAY_RATE = 0.02  # Reduce importance by 2% per cycle for unaccessed entries
    _PRUNE_THRESHOLD = 0.1  # Remove entries below this importance
    _STALE_DAYS = 90  # Entries not accessed in 90 days get decayed

    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_STALE_DAYS)

    try:
        async with async_session_maker() as session:
            # Apply decay to stale entries
            result = await session.execute(
                update(MemoryEntry)
                .where(
                    MemoryEntry.last_accessed < cutoff,
                    MemoryEntry.importance > _PRUNE_THRESHOLD,
                )
                .values(importance=MemoryEntry.importance - _DECAY_RATE)
            )
            if result.rowcount:
                logger.info("Decayed %d stale memory entries", result.rowcount)

            # Prune entries below threshold
            result = await session.execute(
                delete(MemoryEntry).where(MemoryEntry.importance <= _PRUNE_THRESHOLD)
            )
            if result.rowcount:
                logger.info("Pruned %d low-importance memory entries", result.rowcount)

            await session.commit()
    except Exception:
        logger.exception("Memory consolidation failed")


async def cleanup_stale_executions() -> None:
    """Clean up executions stuck in RUNNING/PENDING state."""
    from datetime import datetime, timedelta

    from sqlalchemy import update

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import async_session_maker

    timeout = timedelta(seconds=settings.MAX_EXECUTION_TIMEOUT + 60)
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timeout

    try:
        async with async_session_maker() as session:
            result = await session.execute(
                update(ExecutionRun)
                .where(
                    ExecutionRun.status.in_([ExecutionStatus.RUNNING, ExecutionStatus.PENDING]),
                    ExecutionRun.created_at < cutoff,
                )
                .values(
                    status=ExecutionStatus.FAILED,
                    error_message=f"Execution timed out after {settings.MAX_EXECUTION_TIMEOUT}s (cleanup)",
                    completed_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            if result.rowcount:
                logger.info("Cleaned up %d stale executions", result.rowcount)
            await session.commit()
    except Exception:
        logger.exception("Stale execution cleanup failed")
