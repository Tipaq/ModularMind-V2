"""
Ephemeral Agent Factory.

Creates agents on-the-fly with full MCP/RAG access.
Agents are stored in Redis via ConfigProvider and visible across all processes.
Rate-limited per conversation and globally via Redis INCR.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import redis.asyncio as aioredis

from src.domain_config.provider import ConfigProvider
from src.graph_engine.interfaces import AgentConfig, RAGConfig
from src.infra.constants import DEFAULT_TOOL_CATEGORIES, EPHEMERAL_AGENT_TTL_SECONDS

logger = logging.getLogger(__name__)

MAX_EPHEMERAL_PER_CONVERSATION = 5
MAX_EPHEMERAL_GLOBAL = 50
RATE_LIMIT_PREFIX = "ephemeral_rate:"
RATE_LIMIT_TTL_SECONDS = EPHEMERAL_AGENT_TTL_SECONDS


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
        mcp_tool_categories: dict[str, bool] | None = None,
        tool_categories: dict[str, bool | dict[str, bool]] | None = None,
        gateway_permissions: dict[str, Any] | None = None,
        tool_mode: str | None = None,
        timeout_seconds: int | None = None,
        memory_enabled: bool | None = None,
    ) -> AgentConfig:
        """Create an ephemeral agent and register it in ConfigProvider (Redis).

        Uses the same DEFAULT_TOOL_CATEGORIES as regular agents, merged with
        any provided tool_categories and MCP categories for full parity.

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

        agent_id = str(uuid4())
        rag_config = RAGConfig(
            enabled=bool(rag_collections),
            collection_ids=[UUID(c) for c in (rag_collections or [])],
        )

        routing_metadata: dict = {
            "ephemeral": True,
            "created_at": datetime.now(UTC).isoformat(),
            "conversation_id": conversation_id,
        }

        merged_categories: dict[str, bool | dict[str, bool]] = {**DEFAULT_TOOL_CATEGORIES}
        if tool_categories:
            merged_categories.update(tool_categories)
        if mcp_tool_categories:
            merged_categories.update(mcp_tool_categories)

        resolved_gateway = gateway_permissions or self._build_default_gateway_permissions(
            merged_categories,
        )

        config = AgentConfig(
            id=agent_id,
            name=name,
            description=description,
            system_prompt=system_prompt,
            model_id=model_id,
            capabilities=capabilities or [],
            rag_config=rag_config,
            routing_metadata=routing_metadata,
            tool_categories=merged_categories,
            gateway_permissions=resolved_gateway,
            tool_mode=tool_mode or "direct",
            timeout_seconds=timeout_seconds or 120,
            memory_enabled=memory_enabled if memory_enabled is not None else True,
        )

        await self.config_provider.register_ephemeral_agent(config)

        logger.info(
            "Created ephemeral agent %s (%s) for conversation %s",
            agent_id,
            name,
            conversation_id,
        )
        return config

    @staticmethod
    def _build_default_gateway_permissions(
        categories: dict[str, bool | dict[str, bool]],
    ) -> dict[str, Any] | None:
        """Auto-generate gateway permissions when tool categories require them.

        Returns None if no gateway-facing categories are enabled.
        """
        needs_gateway = (
            categories.get("shell")
            or categories.get("filesystem")
            or categories.get("network")
        )
        if not needs_gateway:
            return None

        perms: dict[str, Any] = {}

        if categories.get("filesystem"):
            perms["filesystem"] = {
                "read": ["/workspace/**"],
                "write": ["/workspace/**"],
            }

        if categories.get("shell"):
            perms["shell"] = {
                "enabled": True,
                "allow": ["*"],
                "require_approval": False,
                "max_execution_seconds": 120,
            }

        if categories.get("network"):
            perms["network"] = {
                "enabled": True,
                "allow_domains": ["*"],
            }

        return perms

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
                f"Max ephemeral agents per conversation ({MAX_EPHEMERAL_PER_CONVERSATION}) reached"
            )

        global_count = len(await self.config_provider.list_ephemeral_agents())
        if global_count >= MAX_EPHEMERAL_GLOBAL:
            await self._redis.decr(rate_key)
            raise ValueError(f"Max global ephemeral agents ({MAX_EPHEMERAL_GLOBAL}) reached")
