"""
Health check router.

Provides health endpoints for monitoring and container orchestration.
"""

import asyncio
import logging
import time
from typing import Any

import httpx
import psutil
import redis
import sqlalchemy.exc
from fastapi import APIRouter

from src.infra.config import get_settings
from src.infra.redis import check_redis_health, get_redis_pool

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Health"])

# Track startup time
_startup_time = time.time()


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Comprehensive health check endpoint.

    Returns:
        Health status of all components
    """
    status = "healthy"
    components: dict[str, Any] = {}

    # Check database
    try:
        from sqlalchemy import text

        from src.infra.database import async_session_maker

        start = time.monotonic()
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        latency = (time.monotonic() - start) * 1000
        components["database"] = {"status": "ok", "latency_ms": round(latency, 2)}
    except (ConnectionError, OSError, sqlalchemy.exc.SQLAlchemyError) as e:
        logger.error("Database health check failed: %s", e)
        components["database"] = {"status": "error", "error": str(e)}
        status = "unhealthy"

    # Check Redis
    redis_ok, redis_latency = await check_redis_health()
    if redis_ok:
        components["redis"] = {
            "status": "ok",
            "latency_ms": round(redis_latency, 2) if redis_latency else None,
        }
    else:
        components["redis"] = {"status": "error"}
        status = "degraded" if status == "healthy" else status

    # Check Qdrant
    try:
        from src.infra.qdrant import qdrant_factory

        start = time.monotonic()
        qdrant_client = await qdrant_factory.get_client()
        await qdrant_client.get_collections()
        latency = (time.monotonic() - start) * 1000
        components["qdrant"] = {"status": "ok", "latency_ms": round(latency, 2)}
    except (ConnectionError, OSError, TimeoutError) as e:
        logger.warning("Qdrant health check failed: %s", e)
        components["qdrant"] = {"status": "unavailable", "error": str(e)}
        if status == "healthy":
            status = "degraded"

    # Check Ollama
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                components["ollama"] = {"status": "ok", "models_loaded": models}
            else:
                components["ollama"] = {"status": "unavailable"}
    except (httpx.HTTPError, ConnectionError, OSError, TimeoutError):
        logger.debug("Ollama health check unavailable")
        components["ollama"] = {"status": "unavailable"}

    # Check worker (Redis Streams consumer health)
    try:
        from src.infra.redis_streams import RedisStreamBus

        bus = RedisStreamBus(redis.asyncio.Redis(connection_pool=get_redis_pool()))
        exec_info = await bus.stream_info("tasks:executions")
        worker_groups = exec_info.get("groups", [])
        components["worker"] = {
            "status": "ok" if worker_groups else "no_consumers",
            "consumer_groups": len(worker_groups),
        }
    except (ConnectionError, OSError, redis.RedisError, Exception):
        logger.debug("Worker health check unavailable")
        components["worker"] = {"status": "unknown"}

    # System metrics (run blocking psutil calls in thread to avoid stalling event loop)
    mem, cpu, disk = await asyncio.gather(
        asyncio.to_thread(psutil.virtual_memory),
        asyncio.to_thread(psutil.cpu_percent, 0.1),
        asyncio.to_thread(psutil.disk_usage, "/"),
    )
    components["system"] = {
        "memory_usage_percent": mem.percent,
        "cpu_usage_percent": cpu,
        "disk_usage_percent": disk.percent,
    }

    uptime = int(time.time() - _startup_time)

    return {
        "status": status,
        "version": settings.APP_VERSION,
        "uptime_seconds": uptime,
        "components": components,
    }


@router.get("/health/live")
async def liveness_probe() -> dict[str, str]:
    """Kubernetes liveness probe.

    Simple check that the application is running.
    """
    return {"status": "alive"}


@router.get("/health/ready")
async def readiness_probe() -> dict[str, Any]:
    """Kubernetes readiness probe.

    Checks if the application is ready to receive traffic.
    """
    # Check database connection
    try:
        from sqlalchemy import text

        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ready"}
    except (ConnectionError, OSError, sqlalchemy.exc.SQLAlchemyError) as e:
        return {"status": "not_ready", "reason": str(e)}
