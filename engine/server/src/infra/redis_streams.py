"""Redis Streams implementation of EventBus.

Features: consumer groups, exponential backoff on failure,
dead-letter queue (DLQ) for messages that exceed max retries.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from src.infra.event_bus import EventBus

logger = logging.getLogger(__name__)

DLQ_STREAM = "pipeline:dlq"
INITIAL_BACKOFF = 1.0
MAX_BACKOFF = 30.0


class RedisStreamBus(EventBus):
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self._running = True

    def stop(self) -> None:
        self._running = False

    async def publish(self, stream: str, data: dict[str, Any]) -> str:
        return await self.redis.xadd(stream, data)

    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int = 3,
    ) -> None:
        await self.ensure_group(stream, group)
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                messages = await self.redis.xreadgroup(
                    groupname=group,
                    consumername=consumer,
                    streams={stream: ">"},
                    count=10,
                    block=5000,
                )
                backoff = INITIAL_BACKOFF

                for _stream_name, entries in messages:
                    for msg_id, data in entries:
                        retry_count = int(data.get("_retry_count", 0))
                        try:
                            await handler(data)
                            await self.redis.xack(stream, group, msg_id)
                        except Exception:  # noqa: BLE001 — Worker resilience: catch all to avoid stream consumer crash
                            logger.exception(
                                "Handler failed for %s msg_id=%s retry=%d",
                                stream,
                                msg_id,
                                retry_count,
                            )
                            if retry_count >= max_retries:
                                await self.redis.xadd(
                                    DLQ_STREAM,
                                    {
                                        "original_stream": stream,
                                        "original_id": msg_id,
                                        "error": f"{retry_count} retries exhausted",
                                        "data": str(data),
                                    },
                                )
                                await self.redis.xack(stream, group, msg_id)
                            else:
                                data["_retry_count"] = str(retry_count + 1)
                                await self.redis.xadd(stream, data)
                                await self.redis.xack(stream, group, msg_id)

            except (ConnectionError, OSError):
                logger.warning("Redis connection lost, backoff=%.1fs", backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
            except Exception:  # noqa: BLE001 — Worker resilience: catch all to avoid stream consumer crash
                logger.exception("Unexpected error in consumer %s/%s", stream, consumer)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    async def ensure_group(self, stream: str, group: str) -> None:
        try:
            await self.redis.xgroup_create(stream, group, id="0", mkstream=True)
        except ResponseError:
            pass  # Group already exists

    async def stream_info(self, stream: str) -> dict[str, Any]:
        try:
            info = await self.redis.xinfo_stream(stream)
            groups = await self.redis.xinfo_groups(stream)
            return {
                "length": info.get("length", 0),
                "groups": [
                    {
                        "name": g["name"],
                        "pending": g["pending"],
                        "consumers": g["consumers"],
                    }
                    for g in groups
                ],
            }
        except ResponseError:
            return {"length": 0, "groups": []}
