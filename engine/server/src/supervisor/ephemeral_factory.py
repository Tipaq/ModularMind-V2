"""
Ephemeral Agent Factory.

Creates agents on-the-fly with full MCP/RAG access.
Agents are stored in Redis via ConfigProvider and visible across all processes.
Rate-limited per conversation and globally via Redis INCR.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

import redis.asyncio as aioredis

from src.domain_config.provider import ConfigProvider
from src.graph_engine.interfaces import AgentConfig, RAGConfig

logger = logging.getLogger(__name__)

MAX_EPHEMERAL_PER_CONVERSATION = 5
MAX_EPHEMERAL_GLOBAL = 50
RATE_LIMIT_PREFIX = "ephemeral_rate:"
RATE_LIMIT_TTL_SECONDS = 86400  # 24 hours


class EphemeralAgentFactory:
    """Factory for creating ephemeral agents on-the-fly.

    Rate limited via Redis INCR (persists across requests and processes).
    """

    def __init__(
        self,
        config_provider: ConfigProvider,
        redis_client: aioredis.Redis,
    ):
        self.config_provider = config_provider
        self._redis = redis_client

    async def create_agent(
        self,
        name: str,
        description: str,
        system_prompt: str,
        conversation_id: str,
        model_id: str | None = None,
        capabilities: list[str] | None = None,
        rag_collections: list[str] | None = None,
        mcp_server_ids: list[str] | None = None,
    ) -> AgentConfig:
        """Create an ephemeral agent and register it in ConfigProvider (Redis).

        Rate limited:
        - max MAX_EPHEMERAL_PER_CONVERSATION per conversation
        - max MAX_EPHEMERAL_GLOBAL globally

        Raises:
            ValueError: If rate limit exceeded
        """
        if not model_id:
            from src.infra.config import get_settings
            model_id = get_settings().SUPERVISOR_MODEL_ID

        await self._check_rate_limit(conversation_id)

        agent_id = uuid4()
        rag_config = RAGConfig(
            enabled=bool(rag_collections),
            collection_ids=[UUID(c) for c in (rag_collections or [])],
        )

        # MCP servers stored in routing_metadata (AgentConfig has no mcp_servers field)
        routing_metadata: dict = {}
        if mcp_server_ids:
            routing_metadata["mcp_server_ids"] = mcp_server_ids
        routing_metadata["ephemeral"] = True
        routing_metadata["created_at"] = datetime.now(timezone.utc).isoformat()
        routing_metadata["conversation_id"] = conversation_id

        config = AgentConfig(
            id=agent_id,
            name=name,
            description=description,
            system_prompt=system_prompt,
            model_id=model_id,
            capabilities=capabilities or [],
            rag_config=rag_config,
            routing_metadata=routing_metadata,
        )

        await self.config_provider.register_ephemeral_agent(config)

        logger.info(
            "Created ephemeral agent %s (%s) for conversation %s",
            agent_id, name, conversation_id,
        )
        return config

    async def _check_rate_limit(self, conversation_id: str) -> None:
        """Check per-conversation and global rate limits via Redis INCR.

        Raises ValueError if either limit is exceeded.
        Rolls back the counter on failure to keep counts accurate.
        """
        rate_key = f"{RATE_LIMIT_PREFIX}{conversation_id}"
        conv_count = await self._redis.incr(rate_key)
        if conv_count == 1:
            await self._redis.expire(rate_key, RATE_LIMIT_TTL_SECONDS)

        if conv_count > MAX_EPHEMERAL_PER_CONVERSATION:
            await self._redis.decr(rate_key)
            raise ValueError(
                f"Max ephemeral agents per conversation "
                f"({MAX_EPHEMERAL_PER_CONVERSATION}) reached"
            )

        global_count = len(await self.config_provider.list_ephemeral_agents())
        if global_count >= MAX_EPHEMERAL_GLOBAL:
            await self._redis.decr(rate_key)
            raise ValueError(
                f"Max global ephemeral agents ({MAX_EPHEMERAL_GLOBAL}) reached"
            )
