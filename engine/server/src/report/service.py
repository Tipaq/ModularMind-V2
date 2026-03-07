"""Report service — collects Engine metrics for Platform reporting."""

import logging
import time
from typing import Any

from src.infra.config import settings

logger = logging.getLogger(__name__)

_startup_time = time.time()


class ReportService:
    """Collects and reports Engine metrics."""

    async def get_status(self) -> dict[str, Any]:
        """Engine status: uptime, version, environment."""
        return {
            "uptime_seconds": int(time.time() - _startup_time),
            "version": "2.0.0",
            "environment": settings.ENVIRONMENT,
        }

    async def get_metrics(self) -> dict[str, Any]:
        """Execution counts, queue depths."""
        from src.infra.redis import get_redis_client

        metrics: dict[str, Any] = {}
        r = await get_redis_client()
        if r:
            try:
                metrics["queue_depth"] = {
                    "executions": await r.xlen("tasks:executions"),
                    "models": await r.xlen("tasks:models"),
                    "memory_raw": await r.xlen("memory:raw"),
                }
                # Execution counts from Redis sorted sets (if metrics module writes them)
                metrics["dead_letter"] = await r.xlen("pipeline:dlq")
            except (ConnectionError, OSError) as e:
                logger.warning("Failed to collect queue metrics: %s", e)
            finally:
                await r.aclose()
        return metrics

    async def get_models(self) -> dict[str, Any]:
        """Available models and their status."""
        from src.models.service import get_model_service

        svc = get_model_service()
        models = svc.list_models()
        installed = await svc.get_installed_ollama_models()
        return {
            "total": len(models),
            "installed": len(installed),
            "models": [
                {
                    "id": m.get("id"),
                    "name": m.get("name"),
                    "provider": m.get("provider"),
                    "available": m.get("model_id", "") in installed
                    if m.get("provider") == "ollama"
                    else True,
                }
                for m in models
            ],
        }

    async def get_pipeline(self) -> dict[str, Any]:
        """Memory pipeline stream info (pending, lag, DLQ)."""
        import redis.asyncio as aioredis

        from src.infra.redis import get_redis_pool
        from src.infra.redis_streams import RedisStreamBus

        bus = RedisStreamBus(aioredis.Redis(connection_pool=get_redis_pool()))
        return {
            "memory_raw": await bus.stream_info("memory:raw"),
            "memory_extracted": await bus.stream_info("memory:extracted"),
            "tasks_executions": await bus.stream_info("tasks:executions"),
            "tasks_models": await bus.stream_info("tasks:models"),
            "dlq": await bus.stream_info("pipeline:dlq"),
        }
