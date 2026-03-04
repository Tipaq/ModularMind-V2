"""APScheduler setup for periodic tasks.

Configures interval and cron jobs for:
- Platform sync polling (every SYNC_INTERVAL_SECONDS)
- Report to platform (every 15 minutes)
- Stale execution cleanup (every 5 minutes)
- Memory consolidation (every 6 hours)
- Memory extraction scan (every MEMORY_EXTRACTION_SCAN_INTERVAL seconds)
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

        # Memory extraction scan — idle + marathon triggers
        scheduler.add_job(
            memory_extraction_scan,
            "interval",
            seconds=settings.MEMORY_EXTRACTION_SCAN_INTERVAL,
            id="memory_extraction_scan",
            name="Scan conversations for memory extraction",
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
            logger.error("Failed to release consolidation lock", exc_info=True)


async def _extract_new_messages(session, conv, now) -> None:
    """Fetch new messages since last extraction and enqueue them."""
    import json
    from datetime import datetime

    from sqlalchemy import select, update

    from src.conversations.models import Conversation, ConversationMessage
    from src.infra.metrics import memory_extraction_enqueued
    from src.infra.publish import enqueue_memory_raw

    cutoff = conv.last_memory_extracted_at or datetime(2000, 1, 1)
    result = await session.execute(
        select(ConversationMessage)
        .where(
            ConversationMessage.conversation_id == conv.id,
            ConversationMessage.created_at > cutoff,
        )
        .order_by(ConversationMessage.created_at)
    )
    messages = list(result.scalars().all())
    if not messages:
        return

    messages_json = json.dumps([
        {"role": m.role.value, "content": m.content}
        for m in messages
    ])

    await enqueue_memory_raw(
        conversation_id=conv.id,
        agent_id=conv.agent_id or "",
        messages=messages_json,
        user_id=conv.user_id,
    )

    latest_msg_time = messages[-1].created_at
    await session.execute(
        update(Conversation)
        .where(Conversation.id == conv.id)
        .values(last_memory_extracted_at=latest_msg_time)
    )
    memory_extraction_enqueued.labels(trigger="idle").inc()
    logger.info(
        "Enqueued %d new messages from conversation %s for extraction",
        len(messages), conv.id,
    )


async def memory_extraction_scan() -> None:
    """Scan for conversations needing memory extraction.

    Two triggers:
    1. Idle >= MEMORY_EXTRACTION_IDLE_SECONDS AND >= MIN_MESSAGES new messages
    2. >= MEMORY_EXTRACTION_BATCH_SIZE new messages (marathon, regardless of idle)
    """
    from datetime import datetime, timedelta

    import sqlalchemy as sa
    from sqlalchemy import func, select

    from src.conversations.models import Conversation, ConversationMessage
    from src.infra.config import get_settings
    from src.infra.database import async_session_maker
    from src.infra.redis import redis_client

    settings = get_settings()

    lock_key = "memory:extraction_scan:lock"
    lock_acquired = await redis_client.set(
        lock_key, "1", nx=True, ex=settings.MEMORY_EXTRACTION_SCAN_INTERVAL,
    )
    if not lock_acquired:
        logger.debug("Memory extraction scan skipped — another scan in progress")
        return

    try:
        now = datetime.now(UTC).replace(tzinfo=None)
        idle_cutoff = now - timedelta(seconds=settings.MEMORY_EXTRACTION_IDLE_SECONDS)
        min_messages = settings.FACT_EXTRACTION_MIN_MESSAGES
        batch_size = settings.MEMORY_EXTRACTION_BATCH_SIZE

        async with async_session_maker() as session:
            # Subquery: count messages after last extraction per conversation
            epoch = datetime(2000, 1, 1)
            new_msg_count = (
                select(
                    ConversationMessage.conversation_id.label("conv_id"),
                    func.count(ConversationMessage.id).label("new_count"),
                )
                .where(
                    ConversationMessage.created_at > func.coalesce(
                        Conversation.last_memory_extracted_at, epoch,
                    )
                )
                .join(Conversation, ConversationMessage.conversation_id == Conversation.id)
                .group_by(ConversationMessage.conversation_id)
                .subquery()
            )

            # Main query: conversations matching either trigger
            query = (
                select(Conversation, new_msg_count.c.new_count)
                .join(new_msg_count, Conversation.id == new_msg_count.c.conv_id)
                .where(
                    Conversation.is_active.is_(True),
                    new_msg_count.c.new_count >= min_messages,
                    sa.or_(
                        Conversation.updated_at < idle_cutoff,
                        new_msg_count.c.new_count >= batch_size,
                    ),
                )
                .limit(20)
            )

            result = await session.execute(query)
            rows = result.all()

            if not rows:
                logger.debug("Memory extraction scan: no conversations to process")
                return

            logger.info("Memory extraction scan: %d conversation(s) to process", len(rows))

            for conv, _new_count in rows:
                try:
                    await _extract_new_messages(session, conv, now)
                except Exception:
                    logger.exception(
                        "Failed to enqueue extraction for conversation %s", conv.id,
                    )

            await session.commit()

    except Exception:
        logger.exception("Memory extraction scan failed")
    finally:
        try:
            await redis_client.delete(lock_key)
        except Exception:
            logger.error("Failed to release extraction scan lock")


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
