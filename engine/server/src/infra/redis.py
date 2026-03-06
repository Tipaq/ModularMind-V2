"""Redis client — cache, pub/sub, leader election, event bus.

Provides async connection pool, FastAPI dependency, standalone client,
health check, and graceful shutdown.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

import redis.asyncio as aioredis

from src.infra.config import settings

logger = logging.getLogger(__name__)

# Type alias used by modules that annotate Redis parameters.
RedisClient = aioredis.Redis

# ---------------------------------------------------------------------------
# Shared async connection pool (lazy singleton)
# ---------------------------------------------------------------------------
_pool: aioredis.ConnectionPool | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Return the shared async connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_timeout=float(settings.REDIS_SOCKET_TIMEOUT),
            socket_keepalive=settings.REDIS_SOCKET_KEEPALIVE,
            retry_on_timeout=True,
        )
    return _pool


# ---------------------------------------------------------------------------
# Module-level singleton (backward compat: `from src.infra.redis import redis_client`)
# ---------------------------------------------------------------------------
# Backed by the same shared pool as get_redis_pool() — no duplicate connections.


class _LazyRedisClient:
    """Proxy that defers pool creation until first attribute access."""

    _client: RedisClient | None = None

    def _get_client(self) -> RedisClient:
        if self._client is None:
            self._client = aioredis.Redis(connection_pool=get_redis_pool())
        return self._client

    def __getattr__(self, name: str):  # noqa: ANN001
        return getattr(self._get_client(), name)


redis_client: RedisClient = _LazyRedisClient()  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
async def get_redis() -> AsyncIterator[RedisClient]:
    """Yield an async Redis client backed by the shared pool.

    Usage::

        @router.get("/example")
        async def example(redis: RedisClient = Depends(get_redis)):
            await redis.set("key", "value")
    """
    client = aioredis.Redis(connection_pool=get_redis_pool())
    try:
        yield client
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Standalone client (non-dependency helper)
# ---------------------------------------------------------------------------
async def get_redis_client() -> RedisClient:
    """Return an async Redis client backed by the shared pool.

    Suitable for use outside of FastAPI dependency injection — e.g. inside
    service functions or background tasks.  The caller does NOT need to
    close the returned client; the underlying pool is managed globally.
    """
    return aioredis.Redis(connection_pool=get_redis_pool())


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
async def check_redis_health() -> tuple[bool, float | None]:
    """Ping Redis and return ``(True, latency_ms)`` if healthy."""
    import time

    client = await get_redis_client()
    try:
        start = time.monotonic()
        ok = await client.ping()
        latency = (time.monotonic() - start) * 1000
        return (ok, latency)
    except (ConnectionError, OSError, aioredis.RedisError):
        logger.exception("Redis health check failed")
        return (False, None)
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
async def close_redis() -> None:
    """Close the module-level client and drain the shared connection pool."""
    global _pool

    # Close the lazy singleton if it was ever initialised.
    proxy = redis_client
    if isinstance(proxy, _LazyRedisClient) and proxy._client is not None:
        try:
            await proxy._client.aclose()
        except (ConnectionError, OSError, aioredis.RedisError):
            logger.debug("redis_client already closed or not initialised")
        proxy._client = None

    if _pool is not None:
        await _pool.disconnect()
        _pool = None
        logger.info("Async Redis connection pool closed")
