"""Task definitions — async functions consumed from Redis Streams.

Each function is an EventBus handler callback: it receives event data dict
and returns when done (or raises to trigger retry/DLQ).
"""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# --- Execution tasks (stream: tasks:executions) ---


async def graph_execution_handler(data: dict[str, Any]) -> None:
    """Execute an agent or graph workflow.

    Receives data from tasks:executions stream:
    - execution_id: str
    - execution_type: "agent" | "graph"
    - agent_id / graph_id: str
    - input_prompt: str
    - input_data: str (JSON)
    - user_id: str
    - ab_model_override: str (optional)
    """
    from src.infra.database import async_session_maker
    from src.executions.service import ExecutionService

    execution_id = data.get("execution_id", "")
    if not execution_id:
        logger.error("graph_execution_handler: missing execution_id")
        return

    logger.info("Starting execution %s", execution_id)

    async with async_session_maker() as session:
        service = ExecutionService(session)

        try:
            async for event in service.execute(execution_id):
                # Publish events to Redis pub/sub for SSE relay
                from src.infra.redis import get_redis_client
                r = await get_redis_client()
                if r:
                    try:
                        channel = f"execution:{execution_id}"
                        await r.publish(channel, json.dumps(event, default=str))
                    finally:
                        await r.aclose()

                if event.get("type") == "complete":
                    break

            await session.commit()
            logger.info("Execution %s completed", execution_id)

        except Exception:
            logger.exception("Execution %s failed", execution_id)
            # Update status to FAILED
            from src.executions.models import ExecutionRun, ExecutionStatus
            from sqlalchemy import update
            from datetime import datetime, timezone

            await session.execute(
                update(ExecutionRun)
                .where(ExecutionRun.id == execution_id)
                .values(
                    status=ExecutionStatus.FAILED,
                    error_message="Worker task failed unexpectedly",
                    completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
                )
            )
            await session.commit()
            raise  # Re-raise to trigger retry/DLQ


# --- Model tasks (stream: tasks:models) ---


async def model_pull_handler(data: dict[str, Any]) -> None:
    """Pull an Ollama model, reporting progress via Redis.

    Receives data from tasks:models stream:
    - model_name: str
    """
    import httpx
    from src.infra.redis import get_redis_client
    from src.infra.config import settings

    model_name = data.get("model_name", "")
    if not model_name:
        logger.error("model_pull_handler: missing model_name")
        return

    logger.info("Pulling model: %s", model_name)
    progress_key = f"runtime:model_pull_progress:{model_name}"

    r = await get_redis_client()
    if not r:
        logger.error("Redis unavailable for model pull progress tracking")
        return

    try:
        await r.hset(progress_key, mapping={"status": "downloading", "progress": "0"})

        async with httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=None
        ) as client:
            async with client.stream(
                "POST", "/api/pull", json={"name": model_name, "stream": True}
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    status = chunk.get("status", "")
                    total = chunk.get("total", 0)
                    completed = chunk.get("completed", 0)
                    pct = int((completed / total * 100) if total else 0)

                    await r.hset(progress_key, mapping={
                        "status": status,
                        "progress": str(pct),
                    })

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

    except Exception:
        logger.exception("Failed to pull model %s", model_name)
        await r.hset(progress_key, mapping={"status": "error", "progress": "0"})
        raise  # Trigger retry/DLQ
    finally:
        await r.aclose()
