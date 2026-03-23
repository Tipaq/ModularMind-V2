"""Gateway hardening middleware — rate limiting, request size, timeouts, request ID."""

from __future__ import annotations

import asyncio
import logging
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# 1MB max request body
MAX_BODY_SIZE = 1_048_576

# 60 second global request timeout
REQUEST_TIMEOUT_SECONDS = 60


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for tracing."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies larger than MAX_BODY_SIZE."""

    async def dispatch(self, request: Request, call_next) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large (max {MAX_BODY_SIZE} bytes)"},
            )
        return await call_next(request)


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """Enforce a global timeout on request processing."""

    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            logger.warning(
                "Request timed out after %ds: %s %s",
                REQUEST_TIMEOUT_SECONDS,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=504,
                content={"detail": f"Request timed out after {REQUEST_TIMEOUT_SECONDS}s"},
            )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory token-bucket rate limiter per IP.

    - Execute endpoint: 60 req/min per IP
    - Other endpoints: 120 req/min per IP
    """

    EXECUTE_LIMIT = 60  # requests per window
    DEFAULT_LIMIT = 120  # requests per window
    WINDOW_SECONDS = 60

    CLEANUP_INTERVAL = 100
    MAX_BUCKETS = 10_000

    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, list[float]] = {}
        self._request_count: int = 0

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for health/metrics
        path = request.url.path
        if path in ("/health", "/metrics", "/api/docs", "/api/redoc", "/openapi.json"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - self.WINDOW_SECONDS

        # Determine limit based on endpoint
        limit = self.EXECUTE_LIMIT if "/execute" in path else self.DEFAULT_LIMIT
        bucket_key = f"{client_ip}:{path.split('/')[1] if '/' in path else path}"

        # Get or create bucket, prune old entries
        timestamps = self._buckets.get(bucket_key, [])
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= limit:
            retry_after = int(timestamps[0] - window_start) + 1
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        timestamps.append(now)
        self._buckets[bucket_key] = timestamps

        # Periodic cleanup of stale buckets
        self._request_count += 1
        if self._request_count % self.CLEANUP_INTERVAL == 0:
            self._cleanup_buckets(window_start)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(limit - len(timestamps))
        return response

    def _cleanup_buckets(self, window_start: float) -> None:
        """Remove stale bucket entries and cap total size."""
        stale = [k for k, v in self._buckets.items() if not v or v[-1] < window_start]
        for k in stale:
            del self._buckets[k]
        if len(self._buckets) > self.MAX_BUCKETS:
            self._buckets.clear()
