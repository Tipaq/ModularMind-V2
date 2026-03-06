"""
Rate limiting middleware for API endpoints.

Provides configurable rate limiting using Redis for distributed tracking
with an in-memory token bucket fallback when Redis is unavailable.

Uses a pure ASGI middleware (not BaseHTTPMiddleware) for better performance.
"""

import logging
import time
from threading import Lock
from typing import Any

import redis.exceptions
from fastapi import HTTPException, Request
from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.infra.config import get_settings
from src.infra.redis import get_redis_client

logger = logging.getLogger(__name__)
settings = get_settings()


def get_rate_limit_client_id(request: Request) -> str:
    """Get client identifier for rate limiting.

    Uses direct connection IP to prevent X-Forwarded-For spoofing.
    Only authenticated users get per-user rate limits.

    Shared utility used by both middleware and dependency.
    """
    if hasattr(request.state, "user_id") and request.state.user_id:
        return f"user:{request.state.user_id}"

    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


class _TokenBucket:
    """Thread-safe in-memory token bucket for single-process fallback.

    Includes automatic cleanup: stale entries are purged every
    _CLEANUP_INTERVAL requests to prevent unbounded memory growth.
    """

    _CLEANUP_INTERVAL = 500  # cleanup every N allow() calls
    _MAX_ENTRIES = 10_000    # hard cap on bucket count
    _MAX_AGE = 300.0         # seconds before an entry is stale

    def __init__(self, rate: float, capacity: int):
        self._rate = rate          # tokens per second
        self._capacity = capacity
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_refill)
        self._lock = Lock()
        self._call_count = 0

    def allow(self, key: str) -> tuple[bool, int]:
        """Check if a request is allowed. Returns (allowed, remaining)."""
        now = time.monotonic()
        with self._lock:
            # Periodic cleanup to prevent memory leak
            self._call_count += 1
            if (
                self._call_count >= self._CLEANUP_INTERVAL
                or len(self._buckets) > self._MAX_ENTRIES
            ):
                self._call_count = 0
                self._cleanup_locked(now)

            tokens, last_refill = self._buckets.get(key, (float(self._capacity), now))

            # Refill tokens based on elapsed time
            elapsed = now - last_refill
            tokens = min(self._capacity, tokens + elapsed * self._rate)

            if tokens >= 1.0:
                tokens -= 1.0
                self._buckets[key] = (tokens, now)
                return True, int(tokens)
            else:
                self._buckets[key] = (tokens, now)
                return False, 0

    def _cleanup_locked(self, now: float) -> None:
        """Remove stale entries. Must be called while holding self._lock."""
        stale = [k for k, (_, ts) in self._buckets.items() if now - ts > self._MAX_AGE]
        for k in stale:
            del self._buckets[k]

    def cleanup(self, max_age: float = 300.0) -> None:
        """Remove stale entries older than max_age seconds."""
        now = time.monotonic()
        with self._lock:
            stale = [k for k, (_, ts) in self._buckets.items() if now - ts > max_age]
            for k in stale:
                del self._buckets[k]


class RateLimitMiddleware:
    """
    Pure ASGI rate limiting middleware with Redis + in-memory fallback.

    Uses sliding window algorithm via Redis sorted sets for distributed
    rate tracking. Falls back to an in-memory token bucket when Redis
    is unavailable (prevents bypass via Redis DoS).
    """

    def __init__(
        self,
        app: ASGIApp,
        requests_per_minute: int | None = None,
        exclude_paths: list[str] | None = None,
    ):
        self.app = app
        self.requests_per_minute = requests_per_minute or settings.RATE_LIMIT_REQUESTS
        self.window_seconds = 60
        self.exclude_paths = exclude_paths or [
            "/health",
            "/api/v1/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/metrics",
        ]
        # In-memory fallback when Redis is down
        self._fallback_bucket = _TokenBucket(
            rate=self.requests_per_minute / 60.0,
            capacity=self.requests_per_minute,
        )
        self._cleanup_counter = 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """ASGI interface."""
        if scope["type"] not in ("http",):
            await self.app(scope, receive, send)
            return

        request = StarletteRequest(scope)
        path = request.url.path

        # Skip excluded paths
        if any(path.startswith(excluded) for excluded in self.exclude_paths):
            await self.app(scope, receive, send)
            return

        client_id = get_rate_limit_client_id(request)
        is_allowed, remaining, reset_at = await self.check_rate_limit(client_id)

        if not is_allowed:
            logger.warning("Rate limit exceeded for client: %s", client_id)
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": reset_at,
                },
                headers={
                    "X-RateLimit-Limit": str(self.requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                    "Retry-After": str(reset_at),
                },
            )
            await response(scope, receive, send)
            return

        # Inject rate limit headers into the response
        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                extra = [
                    (b"x-ratelimit-limit", str(self.requests_per_minute).encode()),
                    (b"x-ratelimit-remaining", str(remaining).encode()),
                    (b"x-ratelimit-reset", str(reset_at).encode()),
                ]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, send_with_headers)

    async def check_rate_limit(
        self, client_id: str
    ) -> tuple[bool, int, int]:
        """Check rate limit using Redis, with in-memory fallback."""
        redis = await get_redis_client()

        if redis:
            try:
                result = await self.check_redis(redis, client_id)
                return result
            except (ConnectionError, OSError, redis.exceptions.RedisError) as e:
                logger.error("Rate limit Redis check failed: %s", e)
            finally:
                await redis.aclose()

        # Fallback to in-memory token bucket
        return self.check_fallback(client_id)

    async def check_redis(
        self, redis: Any, client_id: str
    ) -> tuple[bool, int, int]:
        """Redis-based sliding window check."""
        key = f"ratelimit:{client_id}"
        now = time.time()
        window_start = now - self.window_seconds

        async with redis.pipeline() as pipe:
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, self.window_seconds + 1)
            results = await pipe.execute()

        current_count = results[1]
        remaining = max(0, self.requests_per_minute - current_count - 1)
        reset_at = int(now) + self.window_seconds
        is_allowed = current_count < self.requests_per_minute

        return is_allowed, remaining, reset_at

    def check_fallback(self, client_id: str) -> tuple[bool, int, int]:
        """In-memory token bucket fallback."""
        # Periodic cleanup of stale entries
        self._cleanup_counter += 1
        if self._cleanup_counter >= 1000:
            self._cleanup_counter = 0
            self._fallback_bucket.cleanup()

        is_allowed, remaining = self._fallback_bucket.allow(client_id)
        reset_at = int(time.time()) + self.window_seconds
        return is_allowed, remaining, reset_at


class RateLimitDependency:
    """
    Rate limiting as a FastAPI dependency for specific endpoints.

    Usage:
        @router.get("/expensive", dependencies=[Depends(RateLimitDependency(10))])
        async def expensive_operation():
            ...
    """

    def __init__(self, requests_per_minute: int = 60):
        """Initialize with custom rate limit."""
        self.requests_per_minute = requests_per_minute

    async def __call__(self, request: Request) -> None:
        """Check rate limit for this request.

        Fails closed: if Redis is unavailable, falls back to in-memory
        token bucket rather than silently allowing all requests.
        """
        redis = await get_redis_client()
        if not redis:
            # Fail closed: use in-memory fallback instead of allowing all
            if not hasattr(self, "_fallback_bucket"):
                self._fallback_bucket = _TokenBucket(
                    rate=self.requests_per_minute / 60.0,
                    capacity=self.requests_per_minute,
                )
            client_id = get_rate_limit_client_id(request)
            key = f"dep:{client_id}:{request.url.path}"
            allowed, _ = self._fallback_bucket.allow(key)
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": f"Rate limit of {self.requests_per_minute}/min exceeded",
                    },
                )
            return

        client_id = get_rate_limit_client_id(request)
        key = f"ratelimit:dep:{client_id}:{request.url.path}"
        now = time.time()
        window_start = now - 60

        try:
            async with redis.pipeline() as pipe:
                pipe.zremrangebyscore(key, 0, window_start)
                pipe.zcard(key)
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, 61)
                results = await pipe.execute()

            count = results[1]
            if count >= self.requests_per_minute:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": f"Rate limit of {self.requests_per_minute}/min exceeded",
                    },
                )
        except HTTPException:
            raise
        except (ConnectionError, OSError, redis.exceptions.RedisError) as e:
            logger.error("Rate limit dependency check failed: %s", e)
        finally:
            if redis:
                await redis.aclose()
