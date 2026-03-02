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

from src.infra.config import settings
from src.infra.redis_streams import RedisStreamBus
from src.worker.scheduler import create_scheduler
from src.worker.tasks import document_process_handler, graph_execution_handler, model_pull_handler

logger = logging.getLogger(__name__)

HEALTH_PORT = int(os.environ.get("WORKER_HEALTH_PORT", "8001"))


async def health_server(bus: RedisStreamBus, port: int) -> None:
    """Minimal TCP health check for Docker."""

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            await bus.redis.ping()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
        except Exception:
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

    # Start APScheduler
    scheduler = create_scheduler()
    scheduler.start()

    from src.pipeline.handlers.embedder import embedder_handler
    from src.pipeline.handlers.extractor import extractor_handler

    tasks = [
        # Task queues
        bus.subscribe("tasks:executions", "workers", "w-1", graph_execution_handler),
        bus.subscribe("tasks:models", "workers", "w-1", model_pull_handler),
        bus.subscribe("tasks:documents", "doc-processors", "dp-1", document_process_handler),
        # Memory pipeline: raw -> extractor -> [scorer ->] embedder
        bus.subscribe("memory:raw", "extractors", "ext-1", extractor_handler),
    ]

    # Conditional scorer wiring based on settings
    if settings.MEMORY_SCORER_ENABLED:
        from src.pipeline.handlers.scorer import scorer_handler

        tasks.extend([
            bus.subscribe("memory:extracted", "scorers", "scr-1", scorer_handler),
            bus.subscribe("memory:scored", "embedders", "emb-1", embedder_handler),
        ])
        logger.info("Memory scorer enabled: extracted -> scorer -> scored -> embedder")
    else:
        tasks.append(
            bus.subscribe("memory:extracted", "embedders", "emb-1", embedder_handler),
        )
        logger.info("Memory scorer disabled: extracted -> embedder (direct)")

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
