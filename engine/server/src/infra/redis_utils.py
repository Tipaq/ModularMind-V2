"""
Shared Redis utilities.

Centralizes Redis URL construction and provides a shared synchronous
connection pool for Celery workers and logging handlers.
"""

import redis as sync_redis

from .config import get_settings


def build_redis_url() -> str:
    """Build Redis URL with password injection if needed.

    Reads REDIS_URL and REDIS_PASSWORD from settings. If a password is
    configured and the URL doesn't already contain credentials (no ``@``),
    the password is injected.
    """
    settings = get_settings()
    url = settings.REDIS_URL
    if settings.REDIS_PASSWORD and "@" not in url:
        url = url.replace("redis://", f"redis://:{settings.REDIS_PASSWORD}@", 1)
    return url


# ---------------------------------------------------------------------------
# Synchronous connection pool (for Celery workers / logging)
# ---------------------------------------------------------------------------

_sync_pool: sync_redis.ConnectionPool | None = None


def get_sync_redis_pool() -> sync_redis.ConnectionPool:
    """Get or create a shared synchronous Redis connection pool.

    Used by Celery tasks and the RedisLogHandler to avoid creating
    a new connection per call.
    """
    global _sync_pool
    if _sync_pool is None:
        _sync_pool = sync_redis.ConnectionPool.from_url(
            build_redis_url(),
            decode_responses=True,
            max_connections=20,
            socket_timeout=5,
            retry_on_timeout=True,
        )
    return _sync_pool


def get_sync_redis_client() -> sync_redis.Redis:
    """Get a synchronous Redis client backed by the shared pool."""
    return sync_redis.Redis(connection_pool=get_sync_redis_pool())
