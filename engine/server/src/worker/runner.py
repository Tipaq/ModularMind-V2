"""Worker process runner — single process for background tasks.

1. Redis Streams consumers (filtered by WORKER_STREAMS setting)
2. APScheduler (periodic tasks, gated by WORKER_SCHEDULER setting)
3. Health endpoint (TCP /health for Docker healthcheck)

Environment:
    WORKER_STREAMS  — comma-separated stream categories to consume
                      (executions, models, documents, memory, scheduled_tasks, all)
                      Default: "all"
    WORKER_SCHEDULER — "true"/"false", enable APScheduler on this instance
                       Default: "true"

Usage: python -m src.worker.runner
"""

import asyncio
import logging
import os
import signal
import sys
from collections.abc import Coroutine

import redis.exceptions

from src.infra.config import settings
from src.infra.redis_streams import RedisStreamBus
from src.infra.stream_names import (
    STREAM_DOCUMENTS,
    STREAM_EXECUTIONS,
    STREAM_MEMORY_EXTRACTED,
    STREAM_MEMORY_RAW,
    STREAM_MEMORY_SCORED,
    STREAM_MODELS,
    STREAM_RAG_EMBEDDED,
    STREAM_RAG_EXTRACTED,
    STREAM_SCHEDULED_TASK_TRIGGER,
)
from src.worker.scheduler import create_scheduler
from src.worker.tasks import graph_execution_handler, model_pull_handler

logger = logging.getLogger(__name__)

HEALTH_PORT = int(os.environ.get("WORKER_HEALTH_PORT", "8001"))

VALID_STREAM_CATEGORIES = {"executions", "models", "documents", "memory", "scheduled_tasks"}


def _parse_worker_streams() -> set[str]:
    """Parse WORKER_STREAMS setting into a set of enabled categories."""
    raw = settings.WORKER_STREAMS.strip().lower()
    if raw == "all":
        return VALID_STREAM_CATEGORIES
    categories = {s.strip() for s in raw.split(",") if s.strip()}
    unknown = categories - VALID_STREAM_CATEGORIES
    if unknown:
        logger.warning("Unknown WORKER_STREAMS categories ignored: %s", unknown)
    return categories & VALID_STREAM_CATEGORIES


async def health_server(bus: RedisStreamBus, port: int) -> None:
    """Minimal TCP health check for Docker."""

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            await bus.redis.ping()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
        except (ConnectionError, OSError, redis.exceptions.RedisError):
            writer.write(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 4\r\n\r\nfail")
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "0.0.0.0", port)
    async with server:
        await server.serve_forever()


async def main() -> None:
    from src.infra.redis import redis_client

    bus = RedisStreamBus(redis_client)

    # Register signal handlers for graceful shutdown
    if sys.platform != "win32":
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, bus.stop)
    # On Windows, KeyboardInterrupt (Ctrl+C) is caught in the except block below

    enabled_streams = _parse_worker_streams()
    scheduler_enabled = settings.WORKER_SCHEDULER
    logger.info(
        "Worker starting — streams=%s, scheduler=%s",
        enabled_streams, scheduler_enabled,
    )

    # Initialize secrets store so MCP servers can resolve their tokens
    from src.infra.secrets import secrets_store

    secrets_store.initialize(settings.SECRET_KEY, settings.CONFIG_DIR)

    # Wire Redis into ConfigProvider so the worker can resolve ephemeral agents
    from src.domain_config.provider import get_config_provider

    get_config_provider().set_redis(redis_client)

    # Ensure S3/MinIO buckets exist (worker needs them for document processing)
    from src.infra.object_store import get_object_store

    try:
        store = get_object_store()
        await store.ensure_buckets([settings.S3_BUCKET_RAG, settings.S3_BUCKET_ATTACHMENTS])
        logger.info("S3 buckets initialized")
    except (OSError, ConnectionError) as exc:
        logger.warning("S3 bucket initialization failed (non-fatal): %s", exc)

    # Reconcile scheduler slots with DB state — release any orphaned slots
    # left behind by a previous crash before accepting new tasks
    from src.executions.scheduler import fair_scheduler

    try:
        cleaned = await fair_scheduler.cleanup_stale_slots()
        if cleaned:
            logger.info("Boot cleanup: released %d orphaned scheduler slot(s)", cleaned)
    except (ConnectionError, OSError, redis.exceptions.RedisError):
        logger.warning("Boot scheduler cleanup failed (non-fatal)")

    # Start APScheduler (only if this worker instance owns scheduling)
    scheduler = None
    scheduled_task_runner = None
    if scheduler_enabled:
        scheduler = create_scheduler()
        scheduler.start()

        from src.scheduled_tasks.runner import ScheduledTaskRunner
        from src.worker.scheduler import set_scheduled_task_runner

        scheduled_task_runner = ScheduledTaskRunner(scheduler)
        set_scheduled_task_runner(scheduled_task_runner)
        await scheduled_task_runner.sync_jobs()

    tasks: list[Coroutine] = []

    # --- Execution streams ---
    if "executions" in enabled_streams:
        tasks.append(
            bus.subscribe(STREAM_EXECUTIONS, "workers", "w-1", graph_execution_handler),
        )

    if "models" in enabled_streams:
        tasks.append(
            bus.subscribe(STREAM_MODELS, "workers", "w-1", model_pull_handler),
        )

    # --- Document processing streams ---
    if "documents" in enabled_streams:
        if settings.RAG_MULTI_STAGE_ENABLED:
            from src.rag.handlers.embedder import document_embed_handler
            from src.rag.handlers.extractor import document_extract_handler
            from src.rag.handlers.storer import document_store_handler

            tasks.extend(
                [
                    bus.subscribe(
                        STREAM_DOCUMENTS, "rag-extractors", "ext-1", document_extract_handler
                    ),
                    bus.subscribe(
                        STREAM_RAG_EXTRACTED,
                        "rag-embedders",
                        "emb-1",
                        document_embed_handler,
                    ),
                    bus.subscribe(
                        STREAM_RAG_EMBEDDED, "rag-storers", "stor-1", document_store_handler
                    ),
                ]
            )
            logger.info(
                "RAG multi-stage pipeline enabled: documents -> extractor -> embedder -> storer"
            )
        else:
            from src.worker.tasks import document_process_handler

            tasks.append(
                bus.subscribe(
                    STREAM_DOCUMENTS, "doc-processors", "dp-1", document_process_handler
                ),
            )
            logger.info("RAG monolithic handler enabled: documents -> process_document")

    # --- Memory pipeline streams (legacy — will be removed in Phase 9) ---
    if "memory" in enabled_streams:
        try:
            from src.pipeline.handlers.embedder import embedder_handler
            from src.pipeline.handlers.extractor import extractor_handler
            from src.pipeline.handlers.summarizer import summarizer_handler

            tasks.extend(
                [
                    bus.subscribe(STREAM_MEMORY_RAW, "extractors", "ext-1", extractor_handler),
                    bus.subscribe(STREAM_MEMORY_RAW, "summarizers", "sum-1", summarizer_handler),
                ]
            )
            if settings.MEMORY_SCORER_ENABLED:
                from src.pipeline.handlers.scorer import scorer_handler

                tasks.extend(
                    [
                        bus.subscribe(
                            STREAM_MEMORY_EXTRACTED, "scorers", "scr-1", scorer_handler
                        ),
                        bus.subscribe(
                            STREAM_MEMORY_SCORED, "embedders", "emb-1", embedder_handler
                        ),
                    ]
                )
            else:
                tasks.append(
                    bus.subscribe(
                        STREAM_MEMORY_EXTRACTED, "embedders", "emb-1", embedder_handler
                    ),
                )
        except ImportError:
            logger.info("Memory pipeline handlers not available (removed in Phase 9)")

    # --- Scheduled task trigger stream ---
    if "scheduled_tasks" in enabled_streams and scheduled_task_runner:
        async def scheduled_task_trigger_handler(data: dict) -> None:
            task_id = data.get("scheduled_task_id", "")
            if task_id:
                logger.info("Manual scheduled task trigger: %s", task_id)
                await scheduled_task_runner.execute_trigger(task_id)

        tasks.append(
            bus.subscribe(
                STREAM_SCHEDULED_TASK_TRIGGER,
                "scheduled-task-triggers",
                "st-1",
                scheduled_task_trigger_handler,
            ),
        )

    # --- Always-on: metrics sampler + health ---
    from src.infra.metrics import start_metrics_sampler

    tasks.append(start_metrics_sampler())
    tasks.append(health_server(bus, HEALTH_PORT))

    logger.info("Worker ready — consuming %d stream(s)", len(tasks) - 2)

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Consumer %d failed: %s", i, result)
    except KeyboardInterrupt:
        logger.info("Worker interrupted (Ctrl+C)")
        bus.stop()
    finally:
        if scheduler:
            scheduler.shutdown(wait=False)
        await redis_client.aclose()
        logger.info("Worker stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
    asyncio.run(main())
