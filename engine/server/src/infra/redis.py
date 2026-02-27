"""Redis client — cache, pub/sub, leader election, event bus."""

import redis.asyncio as redis

from src.infra.config import settings

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
