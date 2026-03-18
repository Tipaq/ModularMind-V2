"""Worker process runner — single process for all background tasks.

1. Redis Streams consumers (task queues: executions, models + memory pipeline)
2. APScheduler (periodic tasks: sync poll, memory consolidation, metrics)
3. Health endpoint (TCP /health for Docker healthcheck)

Usage: python -m src.worker.runner
"""

import asyncio
import logging
import os
import signal
import sys

import redis.exceptions

from src.infra.config import settings
from src.infra.redis_streams import RedisStreamBus
from src.infra.stream_names import (
    STREAM_AUTOMATION_TRIGGER,
    STREAM_DOCUMENTS,
    STREAM_EXECUTIONS,
    STREAM_MEMORY_EXTRACTED,
    STREAM_MEMORY_RAW,
    STREAM_MEMORY_SCORED,
    STREAM_MODELS,
    STREAM_RAG_EMBEDDED,
    STREAM_RAG_EXTRACTED,
)
from src.worker.scheduler import create_scheduler
from src.worker.tasks import graph_execution_handler, model_pull_handler

logger = logging.getLogger(__name__)

HEALTH_PORT = int(os.environ.get("WORKER_HEALTH_PORT", "8001"))


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

    logger.info("Worker starting — Redis Streams + APScheduler")

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

    # Start APScheduler
    scheduler = create_scheduler()
    scheduler.start()

    # Wire AutomationRunner into the scheduler for dynamic automation jobs
    from src.automations.runner import AutomationRunner
    from src.worker.scheduler import set_automation_runner

    automation_runner = AutomationRunner(scheduler)
    set_automation_runner(automation_runner)

    tasks = [
        # Task queues
        bus.subscribe(STREAM_EXECUTIONS, "workers", "w-1", graph_execution_handler),
        bus.subscribe(STREAM_MODELS, "workers", "w-1", model_pull_handler),
    ]

    # Document processing: multi-stage RAG pipeline or monolithic handler
    if settings.RAG_MULTI_STAGE_ENABLED:
        from src.rag.handlers.embedder import document_embed_handler
        from src.rag.handlers.extractor import document_extract_handler
        from src.rag.handlers.storer import document_store_handler

        tasks.extend(
            [
                bus.subscribe(
                    STREAM_DOCUMENTS, "rag-extractors", "ext-1", document_extract_handler
                ),
                bus.subscribe(STREAM_RAG_EXTRACTED, "rag-embedders", "emb-1", document_embed_handler),
                bus.subscribe(STREAM_RAG_EMBEDDED, "rag-storers", "stor-1", document_store_handler),
            ]
        )
        logger.info(
            "RAG multi-stage pipeline enabled: documents -> extractor -> embedder -> storer"
        )
    else:
        from src.worker.tasks import document_process_handler

        tasks.append(
            bus.subscribe(STREAM_DOCUMENTS, "doc-processors", "dp-1", document_process_handler),
        )
        logger.info("RAG monolithic handler enabled: documents -> process_document")

    # Memory pipeline (legacy — will be removed in Phase 9)
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
                    bus.subscribe(STREAM_MEMORY_EXTRACTED, "scorers", "scr-1", scorer_handler),
                    bus.subscribe(STREAM_MEMORY_SCORED, "embedders", "emb-1", embedder_handler),
                ]
            )
        else:
            tasks.append(
                bus.subscribe(STREAM_MEMORY_EXTRACTED, "embedders", "emb-1", embedder_handler),
            )
    except ImportError:
        logger.info("Memory pipeline handlers not available (removed in Phase 9)")

    # Automation manual trigger consumer
    async def automation_trigger_handler(data: dict) -> None:
        aid = data.get("automation_id", "")
        if aid:
            logger.info("Manual automation trigger: %s", aid)
            await automation_runner._execute_trigger(aid)

    tasks.append(
        bus.subscribe(
            STREAM_AUTOMATION_TRIGGER,
            "automation-triggers",
            "at-1",
            automation_trigger_handler,
        ),
    )

    # Metrics sampler (system, VRAM, LLM, DLQ snapshots every 10s)
    from src.infra.metrics import start_metrics_sampler

    tasks.append(start_metrics_sampler())

    tasks.append(
        # Health
        health_server(bus, HEALTH_PORT),
    )

    logger.info("Worker ready — consuming streams")

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Consumer %d failed: %s", i, result)
    except KeyboardInterrupt:
        logger.info("Worker interrupted (Ctrl+C)")
        bus.stop()
    finally:
        scheduler.shutdown(wait=False)
        await redis_client.aclose()
        logger.info("Worker stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
    asyncio.run(main())
