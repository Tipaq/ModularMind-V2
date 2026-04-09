from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def model_pull_handler(data: dict[str, Any]) -> None:
    """Pull an Ollama model, reporting progress via Redis.

    Receives data from tasks:models stream:
    - model_name: str
    """
    import httpx

    from src.infra.config import settings
    from src.infra.redis import get_redis_client

    model_name = data.get("model_name", "")
    if not model_name:
        logger.error("model_pull_handler: missing model_name")
        return

    logger.info("Pulling model: %s", model_name)
    progress_key = f"runtime:model_pull_progress:{model_name}"

    r = await get_redis_client()

    try:
        await r.hset(progress_key, mapping={"status": "downloading", "progress": "0"})
        max_pct = 0

        _pull_timeout = httpx.Timeout(connect=30, read=300, write=30, pool=30)
        async with (
            httpx.AsyncClient(base_url=settings.OLLAMA_BASE_URL, timeout=_pull_timeout) as client,
            client.stream("POST", "/api/pull", json={"name": model_name, "stream": True}) as resp,
        ):
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                total = chunk.get("total", 0)
                completed = chunk.get("completed", 0)
                pct = int((completed / total * 100) if total else 0)

                # Never let progress go backwards
                max_pct = max(max_pct, pct)

                await r.hset(
                    progress_key,
                    mapping={
                        "status": "downloading",
                        "progress": str(max_pct),
                    },
                )

                # Check for cancellation
                cancel_key = f"runtime:model_pull_cancel:{model_name}"
                if await r.exists(cancel_key):
                    logger.info("Model pull cancelled: %s", model_name)
                    await r.hset(progress_key, mapping={"status": "cancelled", "progress": "0"})
                    return

        await r.hset(progress_key, mapping={"status": "completed", "progress": "100"})
        # Expire progress key after 1 hour
        await r.expire(progress_key, 3600)
        logger.info("Model %s pulled successfully", model_name)

    except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as exc:
        logger.exception("Failed to pull model %s", model_name)
        await r.hset(
            progress_key,
            mapping={"status": "error", "progress": "0", "error": str(exc)[:500]},
        )
        raise  # Trigger retry/DLQ
    finally:
        await r.aclose()
