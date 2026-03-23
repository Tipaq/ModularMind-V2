"""
Hierarchical Context Manager.

Module-level singleton backed by async Redis for cross-process persistence.
Manages global conversation context and per-agent sub-contexts with
session affinity for follow-up routing.
"""

import logging
from datetime import UTC, datetime

import redis.asyncio as aioredis

from src.infra.constants import EPHEMERAL_AGENT_TTL_SECONDS, MAX_SUPERVISOR_CONTEXT_MESSAGES

from .schemas import SubContext

logger = logging.getLogger(__name__)

_CTX_PREFIX = "supervisor:ctx:"
_AFFINITY_PREFIX = "supervisor:affinity:"
_CTX_AGENT_INDEX = "supervisor:ctx_agents:"
_CTX_TTL = EPHEMERAL_AGENT_TTL_SECONDS
_MAX_GLOBAL_MESSAGES = MAX_SUPERVISOR_CONTEXT_MESSAGES


class HierarchicalContextManager:
    """Singleton context manager for supervisor routing.

    Uses async Redis for persistence — non-blocking in FastAPI context.
    Instantiated once at module level via init_context_manager().
    """

    def __init__(self, redis_client: aioredis.Redis):
        self._redis = redis_client

    async def get_global_context(
        self,
        conversation_id: str,
        messages: list[dict],
    ) -> list[dict]:
        """Get conversation history for routing decisions.

        Returns the last N messages (configurable) for prompt building.
        """
        return messages[-_MAX_GLOBAL_MESSAGES:]

    async def get_sub_context(
        self,
        conversation_id: str,
        agent_id: str,
    ) -> SubContext | None:
        """Get agent-specific sub-context from Redis."""
        key = f"{_CTX_PREFIX}{conversation_id}:{agent_id}"
        raw = await self._redis.get(key)
        if raw:
            return SubContext.model_validate_json(raw)
        return None

    async def update_sub_context(
        self,
        conversation_id: str,
        agent_id: str,
        messages: list[dict],
    ) -> None:
        """Update sub-context in Redis after agent execution."""
        key = f"{_CTX_PREFIX}{conversation_id}:{agent_id}"
        existing = await self.get_sub_context(conversation_id, agent_id)
        ctx = existing or SubContext(
            agent_id=agent_id,
            messages=[],
            last_interaction=datetime.now(UTC),
            execution_count=0,
        )
        ctx.messages.extend(messages)
        ctx.last_interaction = datetime.now(UTC)
        ctx.execution_count += 1

        pipe = self._redis.pipeline()
        pipe.set(key, ctx.model_dump_json(), ex=_CTX_TTL)
        pipe.sadd(f"{_CTX_AGENT_INDEX}{conversation_id}", agent_id)
        await pipe.execute()

    async def get_last_agent(self, conversation_id: str) -> str | None:
        """Get last routed agent for session affinity from Redis.

        Returns str (redis pool uses decode_responses=True).
        """
        return await self._redis.get(f"{_AFFINITY_PREFIX}{conversation_id}")

    async def set_last_agent(
        self,
        conversation_id: str,
        agent_id: str,
    ) -> None:
        """Set session affinity in Redis."""
        await self._redis.set(
            f"{_AFFINITY_PREFIX}{conversation_id}",
            agent_id,
            ex=_CTX_TTL,
        )

    async def cleanup(self, conversation_id: str) -> None:
        """Remove all contexts + affinity for a conversation from Redis.

        Uses index SET instead of KEYS scan.
        """
        agent_ids = await self._redis.smembers(
            f"{_CTX_AGENT_INDEX}{conversation_id}",
        )
        keys_to_delete = [f"{_CTX_PREFIX}{conversation_id}:{aid}" for aid in agent_ids]
        keys_to_delete.append(f"{_AFFINITY_PREFIX}{conversation_id}")
        keys_to_delete.append(f"{_CTX_AGENT_INDEX}{conversation_id}")
        if keys_to_delete:
            await self._redis.delete(*keys_to_delete)

    async def rebuild_from_messages(
        self,
        conversation_id: str,
        messages: list[dict],
    ) -> None:
        """Reconstruct sub-contexts from conversation message history.

        Called on first access if Redis has no data for a conversation
        (cache miss recovery). Iterates messages, groups by agent_id
        from message meta, rebuilds SubContext per agent.
        """
        agent_messages: dict[str, list[dict]] = {}
        last_agent = None
        for msg in messages:
            agent_id = (msg.get("meta") or {}).get("routed_agent_id")
            if agent_id:
                agent_messages.setdefault(agent_id, []).append(msg)
                last_agent = agent_id
        for agent_id, msgs in agent_messages.items():
            await self.update_sub_context(conversation_id, agent_id, msgs)
        if last_agent:
            await self.set_last_agent(conversation_id, last_agent)


# Module-level singleton
_context_manager: HierarchicalContextManager | None = None


def get_context_manager() -> HierarchicalContextManager:
    """Get the singleton context manager. Raises if not initialized."""
    if _context_manager is None:
        raise RuntimeError(
            "HierarchicalContextManager not initialized. Call init_context_manager() at startup."
        )
    return _context_manager


def init_context_manager(
    redis_client: aioredis.Redis,
) -> HierarchicalContextManager:
    """Initialize the singleton. Called once from app lifespan handler."""
    global _context_manager
    _context_manager = HierarchicalContextManager(redis_client)
    return _context_manager
