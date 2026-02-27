"""
Internal log endpoints.

Retrieve logs from Redis ring buffer and stream them via SSE.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.auth import CurrentUser, RequireAdmin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


class LogEntry(BaseModel):
    ts: str
    level: str
    logger: str
    message: str
    source: str


class LogsResponse(BaseModel):
    items: list[LogEntry]
    total: int


@router.get("/logs", dependencies=[RequireAdmin])
async def get_logs(
    user: CurrentUser,
    level: str | None = Query(None, description="Minimum log level filter"),
    search: str | None = Query(None, description="Text search in message"),
    limit: int = Query(200, ge=1, le=2000),
) -> LogsResponse:
    """Retrieve recent logs from the Redis ring buffer."""
    from src.infra.log_handler import RedisLogHandler
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    if not r:
        return LogsResponse(items=[], total=0)

    try:
        raw_entries = await r.lrange(RedisLogHandler.REDIS_KEY, -limit, -1)
    finally:
        await r.aclose()

    level_order = {"DEBUG": 0, "INFO": 1, "WARNING": 2, "ERROR": 3, "CRITICAL": 4}
    min_level = level_order.get(level.upper(), 0) if level else 0
    search_lower = search.lower() if search else None

    items: list[LogEntry] = []
    for raw in raw_entries:
        try:
            entry = json.loads(raw)
        except Exception:
            continue
        if level_order.get(entry.get("level", "DEBUG"), 0) < min_level:
            continue
        if search_lower and search_lower not in entry.get("message", "").lower():
            continue
        items.append(LogEntry(**entry))

    return LogsResponse(items=items, total=len(items))


@router.get("/logs/stream", dependencies=[RequireAdmin])
async def stream_logs(
    user: CurrentUser,
    level: str | None = Query(None, description="Minimum log level filter"),
) -> StreamingResponse:
    """Server-Sent Events stream of real-time logs."""
    from src.infra.log_handler import RedisLogHandler
    from src.infra.redis import get_redis_client

    level_order = {"DEBUG": 0, "INFO": 1, "WARNING": 2, "ERROR": 3, "CRITICAL": 4}
    min_level = level_order.get(level.upper(), 0) if level else 0

    async def event_generator():
        last_len = 0
        r = await get_redis_client()
        try:
            while True:
                try:
                    if not r:
                        r = await get_redis_client()
                    if not r:
                        await asyncio.sleep(1)
                        continue
                    current_len = await r.llen(RedisLogHandler.REDIS_KEY)
                    if current_len > last_len:
                        start = last_len if last_len > 0 else max(0, current_len - 50)
                        new_entries = await r.lrange(
                            RedisLogHandler.REDIS_KEY, start, current_len - 1
                        )
                        for raw in new_entries:
                            try:
                                entry = json.loads(raw)
                            except Exception:
                                continue
                            if level_order.get(entry.get("level", "DEBUG"), 0) < min_level:
                                continue
                            yield f"event: log\ndata: {json.dumps(entry)}\n\n"
                    last_len = current_len
                except Exception:
                    # Reconnect on error
                    r = None
                await asyncio.sleep(1)
        finally:
            if r:
                await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
