"""Worker process runner — single process for all background tasks.

Replaces Celery worker + Celery beat + pipeline consumer with a single process:
1. Redis Streams consumers (task queues: executions, models + memory pipeline)
2. APScheduler (periodic tasks: sync poll, memory consolidation, metrics)
3. Health endpoint (HTTP /health for Docker healthcheck)

Usage: python -m src.worker.runner
"""

import asyncio
import logging
import signal

from src.infra.config import settings

logger = logging.getLogger(__name__)


async def run_worker() -> None:
    """Main worker entry point."""
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown_event.set)

    logger.info("Worker starting — Redis Streams + APScheduler")

    # TODO: Initialize components
    # 1. Create RedisStreamsEventBus instance
    # 2. Start task consumers (executions, models queues)
    # 3. Start memory pipeline consumers (memory:raw, memory:extracted)
    # 4. Start APScheduler with periodic jobs
    # 5. Start health HTTP server on WORKER_HEALTH_PORT

    logger.info("Worker ready — waiting for events")
    await shutdown_event.wait()

    logger.info("Worker shutting down gracefully")
    # TODO: Stop scheduler, drain consumers, close connections


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
    asyncio.run(run_worker())
