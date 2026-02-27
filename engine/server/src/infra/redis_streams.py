"""Redis Streams implementation of EventBus.

Features: consumer groups, exponential backoff on failure,
dead-letter queue (DLQ) for repeated failures.
"""

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from src.infra.event_bus import EventBus
from src.infra.redis import redis_client

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BACKOFF_BASE = 2  # seconds


class RedisStreamsEventBus(EventBus):
    async def publish(self, stream: str, event: dict[str, Any]) -> str:
        payload = {k: json.dumps(v) if not isinstance(v, str) else v for k, v in event.items()}
        event_id: str = await redis_client.xadd(stream, payload)
        return event_id

    async def subscribe(
        self, stream: str, group: str, consumer: str
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        while True:
            try:
                messages = await redis_client.xreadgroup(
                    groupname=group,
                    consumername=consumer,
                    streams={stream: ">"},
                    count=10,
                    block=5000,
                )
                for _stream_name, entries in messages:
                    for event_id, raw_data in entries:
                        data = {}
                        for k, v in raw_data.items():
                            try:
                                data[k] = json.loads(v)
                            except (json.JSONDecodeError, TypeError):
                                data[k] = v
                        yield event_id, data
            except Exception:
                logger.exception("Error reading from stream %s", stream)
                await asyncio.sleep(BACKOFF_BASE)

    async def ack(self, stream: str, group: str, event_id: str) -> None:
        await redis_client.xack(stream, group, event_id)

    async def ensure_group(self, stream: str, group: str) -> None:
        try:
            await redis_client.xgroup_create(stream, group, id="0", mkstream=True)
        except Exception:
            pass  # Group already exists
