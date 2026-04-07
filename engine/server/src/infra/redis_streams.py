"""Redis Streams implementation of EventBus.

Features: consumer groups, exponential backoff on failure,
dead-letter queue (DLQ) for messages that exceed max retries,
pending message recovery on startup (crash resilience).
"""

import asyncio
import contextlib
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
STREAM_MAXLEN = 10_000


class RedisStreamBus(EventBus):
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self._running = True

    def stop(self) -> None:
        self._running = False

    async def publish(self, stream: str, data: dict[str, Any]) -> str:
        return await self.redis.xadd(
            stream, data, maxlen=STREAM_MAXLEN, approximate=True,
        )

    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int = 3,
    ) -> None:
        await self.ensure_group(stream, group)
        await self._recover_pending(stream, group, consumer, handler, max_retries)
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
                        await self._process_entry(
                            stream, group, msg_id, data, handler, max_retries,
                        )

            except (ConnectionError, OSError):
                logger.warning("Redis connection lost, backoff=%.1fs", backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
            except Exception:  # noqa: BLE001 — Worker resilience: catch all to avoid stream consumer crash
                logger.exception("Unexpected error in consumer %s/%s", stream, consumer)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    async def _process_entry(
        self,
        stream: str,
        group: str,
        msg_id: str,
        data: dict[str, Any],
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int,
    ) -> None:
        retry_count = int(data.get("_retry_count", 0))
        try:
            await handler(data)
        except Exception:  # noqa: BLE001
            logger.exception(
                "Handler failed for %s msg_id=%s retry=%d",
                stream, msg_id, retry_count,
            )
            if retry_count >= max_retries:
                await self._safe_xadd(
                    DLQ_STREAM,
                    {
                        "original_stream": stream,
                        "original_id": msg_id,
                        "error": f"{retry_count} retries exhausted",
                        "data": str(data),
                    },
                )
            else:
                data["_retry_count"] = str(retry_count + 1)
                await self._safe_xadd(stream, data)

        # Always ack — separated from handler try/except so xack failures
        # don't get swallowed by the handler exception path.
        await self._safe_xack(stream, group, msg_id)

    async def _safe_xack(self, stream: str, group: str, msg_id: str) -> None:
        """Acknowledge a message with retry on transient Redis errors."""
        for attempt in range(3):
            try:
                await self.redis.xack(stream, group, msg_id)
                return
            except (ConnectionError, OSError) as exc:
                if attempt == 2:
                    logger.error(
                        "xack failed after 3 attempts for %s/%s msg=%s: %s",
                        stream, group, msg_id, exc,
                    )
                else:
                    await asyncio.sleep(0.5 * (attempt + 1))

    async def _safe_xadd(self, stream: str, data: dict[str, Any]) -> None:
        """Write to a stream with a single retry on transient error."""
        try:
            await self.redis.xadd(stream, data, maxlen=STREAM_MAXLEN, approximate=True)
        except (ConnectionError, OSError):
            logger.warning("xadd to %s failed, retrying once", stream)
            try:
                await asyncio.sleep(0.5)
                await self.redis.xadd(stream, data, maxlen=STREAM_MAXLEN, approximate=True)
            except (ConnectionError, OSError):
                logger.error("xadd to %s failed twice, message dropped", stream)

    async def _recover_pending(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int,
    ) -> None:
        """Re-process messages left pending from a previous crash.

        Reads with stream id "0" to fetch all unacknowledged entries for this
        consumer, then processes each one through the normal handler/retry flow.
        """
        try:
            pending = await self.redis.xreadgroup(
                groupname=group,
                consumername=consumer,
                streams={stream: "0"},
                count=100,
            )
            recovered = 0
            for _stream_name, entries in pending:
                for msg_id, data in entries:
                    if not data:
                        await self.redis.xack(stream, group, msg_id)
                        continue
                    await self._process_entry(
                        stream, group, msg_id, data, handler, max_retries,
                    )
                    recovered += 1
            if recovered:
                logger.info(
                    "Recovered %d pending message(s) from %s/%s",
                    recovered, stream, consumer,
                )
        except (ConnectionError, OSError, ResponseError):
            logger.warning("Pending recovery failed for %s/%s", stream, consumer)

    async def ensure_group(self, stream: str, group: str) -> None:
        with contextlib.suppress(ResponseError):  # Group already exists
            await self.redis.xgroup_create(stream, group, id="0", mkstream=True)

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
