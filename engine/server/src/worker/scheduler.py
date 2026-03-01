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
    """Consolidate memory entries — exponential decay, consolidation, promotion, graph rebuild."""
    from datetime import datetime, timedelta

    from sqlalchemy import delete

    from src.infra.database import async_session_maker
    from src.infra.redis import redis_client
    from src.memory.consolidator import apply_exponential_decay
    from src.memory.models import ConsolidationLog
    from src.memory.repository import MemoryRepository

    # Acquire Redis lock to prevent concurrent runs
    lock_key = "memory:consolidation:lock"
    lock_acquired = await redis_client.set(lock_key, "1", nx=True, ex=1800)  # 30min TTL
    if not lock_acquired:
        logger.warning("Memory consolidation skipped — another run is in progress")
        return

    try:
        async with async_session_maker() as session:
            repo = MemoryRepository(session)

            # Step 1: Apply exponential decay
            decayed, invalidated = await apply_exponential_decay(session, settings)
            logger.info(
                "Consolidation step 1 (decay): %d decayed, %d invalidated",
                decayed,
                invalidated,
            )

            # Step 2: Enumerate active scopes (max 20 per cycle)
            all_scopes = await repo.get_distinct_scopes()
            scopes_to_process = all_scopes[:20]  # Round-robin limit

            logger.info(
                "Consolidation step 2: processing %d/%d scopes",
                len(scopes_to_process),
                len(all_scopes),
            )

            # Steps 3-4: LLM consolidation + promotion (placeholder — full implementation in future)
            # TODO: Implement MemoryConsolidator.consolidate_scope() and promote_episodic_to_semantic()
            # For now, just log the scopes that would be processed
            for scope, scope_id in scopes_to_process:
                logger.debug(
                    "Would consolidate scope %s/%s", scope.value, scope_id
                )

            # Step 5: Cleanup old consolidation logs (> 30 days)
            cutoff = datetime.now().replace(tzinfo=None) - timedelta(days=30)
            result = await session.execute(
                delete(ConsolidationLog).where(
                    ConsolidationLog.created_at < cutoff
                )
            )
            if result.rowcount:
                logger.info("Cleaned up %d old consolidation logs", result.rowcount)

            await session.commit()

        logger.info("Memory consolidation complete")
    except Exception:
        logger.exception("Memory consolidation failed")
    finally:
        # Release Redis lock
        try:
            await redis_client.delete(lock_key)
        except Exception:
            logger.error("Failed to release consolidation lock")


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
