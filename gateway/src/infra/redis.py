"""Redis client for Gateway — pub/sub for approval events."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

import redis.asyncio as aioredis

from src.config import get_settings

logger = logging.getLogger(__name__)

RedisClient = aioredis.Redis

_pool: aioredis.ConnectionPool | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Return the shared async connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_timeout=float(settings.REDIS_SOCKET_TIMEOUT),
            socket_keepalive=settings.REDIS_SOCKET_KEEPALIVE,
            retry_on_timeout=True,
        )
    return _pool


async def get_redis() -> AsyncIterator[RedisClient]:
    """FastAPI dependency — yield a Redis client backed by shared pool."""
    client = aioredis.Redis(connection_pool=get_redis_pool())
    try:
        yield client
    finally:
        await client.aclose()


async def get_redis_client() -> RedisClient:
    """Standalone client for non-dependency use."""
    return aioredis.Redis(connection_pool=get_redis_pool())


async def close_redis() -> None:
    """Close the shared connection pool."""
    global _pool
    if _pool is not None:
        await _pool.disconnect()
        _pool = None
        logger.info("Gateway Redis connection pool closed")
