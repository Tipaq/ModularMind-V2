"""APScheduler setup for periodic tasks.

Configures interval and cron jobs for:
- Platform sync polling (every SYNC_INTERVAL_SECONDS)
- Report to platform (every 15 minutes)
- Stale execution cleanup (every 5 minutes)
- Profile synthesis (every PROFILE_SYNTHESIS_INTERVAL seconds)
- RAG consolidation (every RAG_CONSOLIDATION_INTERVAL seconds)
"""

import logging

import httpx
import redis.exceptions
import sqlalchemy.exc
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.infra.config import settings
from src.infra.utils import utcnow

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

    # User profile auto-synthesis
    scheduler.add_job(
        profile_synthesis_scan,
        "interval",
        seconds=settings.PROFILE_SYNTHESIS_INTERVAL,
        id="profile_synthesis_scan",
        name="Synthesize user profiles from recent conversations",
    )

    # RAG consolidation (decay + obsolescence detection)
    scheduler.add_job(
        rag_consolidation,
        "interval",
        seconds=settings.RAG_CONSOLIDATION_INTERVAL,
        id="rag_consolidation",
        name="RAG chunk decay and document obsolescence detection",
    )

    # Orphaned attachment cleanup (every hour)
    scheduler.add_job(
        cleanup_orphaned_attachments,
        "interval",
        seconds=3600,
        id="cleanup_orphaned_attachments",
        name="Delete unclaimed chat attachments from MinIO",
    )

    return scheduler


_automation_runner = None


def set_automation_runner(runner) -> None:
    """Set the global AutomationRunner instance (called from worker startup)."""
    global _automation_runner
    _automation_runner = runner


async def sync_platform() -> None:
    """Poll platform for manifest changes and apply updates."""
    from src.sync.service import SyncService

    svc = SyncService()
    await svc.initialize()
    try:
        updated = await svc.poll()
        if updated:
            logger.info("Config updated from platform")
            # Sync automation scheduler jobs after config update
            if _automation_runner:
                try:
                    await _automation_runner.sync_jobs()
                except Exception:
                    logger.exception("Failed to sync automation jobs")
    except (httpx.HTTPError, ConnectionError, OSError, TimeoutError, ValueError):
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
    except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
        logger.exception("Failed to report to platform")


async def cleanup_orphaned_attachments() -> None:
    """Delete chat attachments uploaded to MinIO but never claimed by a message.

    Strategy: list objects in the chat-attachments bucket, check Redis for a pending
    key.  If the pending key is gone (TTL expired) and no DB message references the
    attachment id, the object is orphaned and safe to delete.
    """
    from datetime import datetime, timedelta, timezone

    from src.infra.config import get_settings
    from src.infra.object_store import get_object_store
    from src.infra.redis import get_redis_client

    s = get_settings()
    store = get_object_store()
    # Only consider objects older than 2 hours (pending TTL is 1h)
    age_threshold = datetime.now(timezone.utc) - timedelta(hours=2)

    try:
        objects = await store.list_objects(s.S3_BUCKET_ATTACHMENTS, prefix="chat/")
    except (OSError, ConnectionError):
        logger.exception("Failed to list attachment objects for cleanup")
        return

    if not objects:
        return

    r = await get_redis_client()
    deleted = 0

    try:
        for obj in objects:
            # Skip recent objects
            last_modified = obj.get("LastModified")
            if last_modified and last_modified > age_threshold:
                continue

            key = obj.get("Key", "")
            # Extract attachment_id from path: chat/{conv_id}/{att_id}/{filename}
            parts = key.split("/")
            if len(parts) < 4:
                continue
            att_id = parts[2]

            # Check if pending Redis key still exists
            pending_key = f"attachment:pending:{att_id}"
            if await r.exists(pending_key):
                continue

            # Object is old and no longer pending — delete it
            try:
                await store.delete(s.S3_BUCKET_ATTACHMENTS, key)
                deleted += 1
            except (OSError, ConnectionError):
                logger.warning("Failed to delete orphaned attachment %s", key)

        if deleted:
            logger.info("Cleaned up %d orphaned chat attachment(s)", deleted)
    except (OSError, ConnectionError, redis.exceptions.RedisError):
        logger.exception("Orphaned attachment cleanup failed")
    finally:
        await r.aclose()


async def cleanup_stale_executions() -> None:
    """Clean up executions stuck in RUNNING/PENDING state."""
    from datetime import datetime, timedelta

    from sqlalchemy import update

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import async_session_maker

    timeout = timedelta(seconds=settings.MAX_EXECUTION_TIMEOUT + 60)
    cutoff = utcnow() - timeout

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
                    completed_at=utcnow(),
                )
            )
            if result.rowcount:
                logger.info("Cleaned up %d stale executions", result.rowcount)
            await session.commit()
    except sqlalchemy.exc.SQLAlchemyError:
        logger.exception("Stale execution cleanup failed")


async def profile_synthesis_scan() -> None:
    """Synthesize user profiles from recent conversations.

    Processes users with new conversations since their last synthesis,
    in batches of 20 using asyncio.gather().
    """
    import asyncio

    from sqlalchemy import func, select

    from src.auth.models import User
    from src.auth.profile_synthesizer import ProfileSynthesizer
    from src.conversations.models import Conversation
    from src.infra.database import async_session_maker

    try:
        async with async_session_maker() as session:
            # Find users with conversations newer than their last synthesis
            from datetime import datetime

            epoch = datetime(2000, 1, 1)
            result = await session.execute(
                select(User.id)
                .join(Conversation, Conversation.user_id == User.id)
                .where(
                    User.is_active.is_(True),
                    Conversation.updated_at > func.coalesce(
                        User.last_profile_synthesis_at, epoch,
                    ),
                )
                .group_by(User.id)
                .limit(100)
            )
            user_ids = [row[0] for row in result.all()]

        if not user_ids:
            logger.debug("Profile synthesis: no users to process")
            return

        logger.info("Profile synthesis: %d user(s) to process", len(user_ids))
        synthesizer = ProfileSynthesizer()

        # Process in batches of 20
        for i in range(0, len(user_ids), 20):
            batch = user_ids[i : i + 20]
            results = await asyncio.gather(
                *[_synthesize_one(synthesizer, uid) for uid in batch],
                return_exceptions=True,
            )
            successes = sum(1 for r in results if r is True)
            failures = sum(1 for r in results if isinstance(r, Exception))
            logger.info(
                "Profile synthesis batch %d-%d: %d successes, %d failures",
                i, i + len(batch), successes, failures,
            )

    except (sqlalchemy.exc.SQLAlchemyError, OSError):
        logger.exception("Profile synthesis scan failed")


async def _synthesize_one(synthesizer, user_id: str) -> bool:
    """Synthesize profile for a single user (for gather)."""
    from src.infra.database import async_session_maker

    try:
        async with async_session_maker() as session:
            result = await synthesizer.synthesize(user_id, session)
            if result is not None:
                await session.commit()
                return True
            return False
    except Exception:
        logger.warning("Profile synthesis failed for user %s", user_id, exc_info=True)
        raise


async def rag_consolidation() -> None:
    """Periodic RAG data maintenance: decay unused chunks, detect obsolete documents."""
    from sqlalchemy import select

    from src.infra.database import async_session_maker
    from src.rag.consolidator import RAGConsolidator
    from src.rag.models import RAGCollection

    consolidator = RAGConsolidator()

    try:
        async with async_session_maker() as session:
            # Step 1: Decay unused chunks
            decayed = await consolidator.decay_unused_chunks(session, batch_limit=1000)
            if decayed:
                logger.info("RAG consolidation: %d chunks decayed", decayed)

            # Step 2: Detect obsolete documents per collection
            collections = await session.execute(select(RAGCollection.id))
            coll_ids = [row[0] for row in collections.all()]

            total_obsolete = 0
            for coll_id in coll_ids:
                obsolete = await consolidator.detect_obsolete_documents(coll_id, session)
                total_obsolete += len(obsolete)

            if total_obsolete:
                logger.info("RAG consolidation: %d obsolete documents found", total_obsolete)

            await session.commit()

    except (sqlalchemy.exc.SQLAlchemyError, OSError):
        logger.exception("RAG consolidation failed")
