"""SSE (Server-Sent Events) response utility.

All streaming endpoints use this module:
- GET /api/v1/executions/:id/stream  (tokens, traces, complete/error)
- GET /api/v1/internal/logs/stream   (log streaming)
- GET /api/v1/models/pull/:task_id/stream (pull progress)
"""

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Request
from starlette.responses import StreamingResponse


async def sse_response(
    generator: AsyncGenerator[dict[str, Any], None],
    request: Request,
) -> StreamingResponse:
    """Wrap an async generator into an SSE StreamingResponse.

    Each yielded dict must contain at least a "type" key for the event type.
    Optional "id" key enables Last-Event-ID reconnection.
    """

    async def stream():
        try:
            async for event in generator:
                if await request.is_disconnected():
                    break
                event_type = event.get("type", "message")
                event_id = event.get("id")
                lines = f"event: {event_type}\n"
                if event_id:
                    lines += f"id: {event_id}\n"
                lines += f"data: {json.dumps(event)}\n\n"
                yield lines
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
