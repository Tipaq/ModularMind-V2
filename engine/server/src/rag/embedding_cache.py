"""Redis-backed embedding cache for query embeddings.

Caches query embedding vectors to avoid redundant API calls.
Document chunk embeddings are stored directly in Qdrant.
"""

import hashlib
import json
import logging
import unicodedata

import redis.asyncio as redis

from src.infra.redis import get_redis_pool

logger = logging.getLogger(__name__)

# Default TTL: 1 hour (query embeddings are ephemeral)
_DEFAULT_TTL = 3600


def normalize(text: str) -> str:
    """Normalize text for consistent cache keys."""
    return unicodedata.normalize("NFC", text.strip().lower())


def cache_key(text: str) -> str:
    """Generate Redis key from normalized text."""
    normalized = normalize(text)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"embed:{digest}"


class EmbeddingCache:
    """Redis-backed cache for query embedding vectors."""

    def __init__(self, ttl: int = _DEFAULT_TTL) -> None:
        self.ttl = ttl
        self._client: redis.Redis | None = None

    def _get_client(self) -> redis.Redis:
        """Get or create the shared Redis client from the connection pool."""
        if self._client is None:
            pool = get_redis_pool()
            self._client = redis.Redis(connection_pool=pool)
        return self._client

    async def get(self, text: str) -> list[float] | None:
        """Get cached embedding for a query text."""
        try:
            r = self._get_client()
            key = cache_key(text)
            data = await r.get(key)
            if data is None:
                return None
            return json.loads(data)
        except Exception as e:
            logger.debug("Embedding cache get error: %s", e)
            return None

    async def set(self, text: str, embedding: list[float], ttl: int | None = None) -> None:
        """Cache a query embedding vector."""
        try:
            r = self._get_client()
            key = cache_key(text)
            await r.set(key, json.dumps(embedding), ex=ttl or self.ttl)
        except Exception as e:
            logger.debug("Embedding cache set error: %s", e)

    async def close(self) -> None:
        """Close the Redis client (for clean shutdown)."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None


# Module-level singleton
embedding_cache = EmbeddingCache()
