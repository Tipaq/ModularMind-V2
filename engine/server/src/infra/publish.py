"""Task publishing via Redis Streams."""

import json
import logging
from typing import Any

from src.infra.redis_streams import RedisStreamBus

logger = logging.getLogger(__name__)

_bus: RedisStreamBus | None = None


async def get_event_bus() -> RedisStreamBus:
    """Get or create the global RedisStreamBus singleton."""
    global _bus
    if _bus is None:
        import redis.asyncio as aioredis

        from src.infra.redis import get_redis_pool

        client = aioredis.Redis(connection_pool=get_redis_pool())
        _bus = RedisStreamBus(client)
    return _bus


async def enqueue_execution(
    execution_id: str,
    execution_type: str,
    agent_id: str | None = None,
    graph_id: str | None = None,
    input_prompt: str = "",
    input_data: dict[str, Any] | None = None,
    user_id: str = "",
    ab_model_override: str | None = None,
) -> str:
    """Publish an execution task to tasks:executions stream."""
    bus = await get_event_bus()
    payload: dict[str, str] = {
        "execution_id": execution_id,
        "execution_type": execution_type,
        "input_prompt": input_prompt,
        "input_data": json.dumps(input_data or {}),
        "user_id": user_id,
    }
    if agent_id:
        payload["agent_id"] = agent_id
    if graph_id:
        payload["graph_id"] = graph_id
    if ab_model_override:
        payload["ab_model_override"] = ab_model_override
    msg_id = await bus.publish("tasks:executions", payload)
    logger.info("Enqueued execution %s → tasks:executions (msg=%s)", execution_id, msg_id)
    return msg_id


async def enqueue_model_pull(model_name: str) -> str:
    """Publish a model pull task to tasks:models stream."""
    bus = await get_event_bus()
    msg_id = await bus.publish("tasks:models", {"model_name": model_name})
    logger.info("Enqueued model pull %s → tasks:models (msg=%s)", model_name, msg_id)
    return msg_id


async def enqueue_dataset_build(dataset_id: str, agent_id: str, filters: str) -> str:
    """Publish a dataset build task to tasks:fine_tuning stream."""
    bus = await get_event_bus()
    msg_id = await bus.publish(
        "tasks:fine_tuning",
        {
            "task_type": "build_dataset",
            "dataset_id": dataset_id,
            "agent_id": agent_id,
            "filters": filters,
        },
    )
    logger.info("Enqueued dataset build %s (msg=%s)", dataset_id, msg_id)
    return msg_id


async def enqueue_code_reindex(repo_url: str, repo_name: str) -> str:
    """Publish a code reindex task to tasks:code_index stream."""
    bus = await get_event_bus()
    msg_id = await bus.publish(
        "tasks:code_index",
        {"repo_url": repo_url, "repo_name": repo_name},
    )
    logger.info("Enqueued code reindex %s → tasks:code_index (msg=%s)", repo_name, msg_id)
    return msg_id


async def enqueue_fine_tuning_job(job_id: str) -> str:
    """Publish a fine-tuning job to tasks:fine_tuning stream."""
    bus = await get_event_bus()
    msg_id = await bus.publish(
        "tasks:fine_tuning",
        {
            "task_type": "run_fine_tuning_job",
            "job_id": job_id,
        },
    )
    logger.info("Enqueued fine-tuning job %s (msg=%s)", job_id, msg_id)
    return msg_id
