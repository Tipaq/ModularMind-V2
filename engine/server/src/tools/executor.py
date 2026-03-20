"""Extended tool executor.

Dispatches tool calls to the appropriate category handler.
Follows the same async execute(name, args) -> str protocol
as MCPToolExecutor and GatewayToolExecutor.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

# Prefixes for routing tool calls to the correct handler
_CATEGORY_PREFIXES = (
    "memory_",
    "knowledge_",
    "storage_",
    "human_",
    "image_",
    "custom_tool_",
    "custom__",
    "mini_app_",
)


class ExtendedToolExecutor:
    """Executes extended tool calls by dispatching to category handlers."""

    def __init__(
        self,
        session_maker: Callable,
        user_id: str,
        agent_id: str,
        rag_retriever: Any | None = None,
        object_store: Any | None = None,
        gateway_executor: Any | None = None,
        publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ):
        self._session_maker = session_maker
        self._user_id = user_id
        self._agent_id = agent_id
        self._rag_retriever = rag_retriever
        self._object_store = object_store
        self._gateway_executor = gateway_executor
        self._publish_fn = publish_fn

    def handles(self, name: str) -> bool:
        """Check if this executor handles a tool name."""
        return any(name.startswith(prefix) for prefix in _CATEGORY_PREFIXES)

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        """Execute a tool by name, dispatching to the correct handler."""
        try:
            if name.startswith("memory_"):
                return await self._handle_memory(name, args)
            if name.startswith("knowledge_"):
                return await self._handle_knowledge(name, args)
            if name.startswith("storage_"):
                return await self._handle_storage(name, args)
            if name.startswith("human_"):
                return await self._handle_human_interaction(name, args)
            if name.startswith("image_"):
                return await self._handle_image_generation(name, args)
            if name.startswith("custom_tool_"):
                return await self._handle_custom_tools(name, args)
            if name.startswith("custom__"):
                return await self._handle_registered_custom_tool(name, args)
            if name.startswith("mini_app_"):
                return await self._handle_mini_app(name, args)
            return f"Error: unknown extended tool '{name}'"
        except Exception as e:
            logger.exception("Extended tool '%s' failed", name)
            return f"Error: {e}"

    async def _handle_memory(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.memory import execute_memory_tool

        async with self._session_maker() as session:
            return await execute_memory_tool(
                name, args, user_id=self._user_id, session=session,
            )

    async def _handle_knowledge(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.knowledge import execute_knowledge_tool

        async with self._session_maker() as session:
            return await execute_knowledge_tool(
                name, args,
                user_id=self._user_id,
                session=session,
                rag_retriever=self._rag_retriever,
            )

    async def _handle_storage(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.file_storage import execute_storage_tool

        async with self._session_maker() as session:
            return await execute_storage_tool(
                name, args,
                user_id=self._user_id,
                agent_id=self._agent_id,
                session=session,
                object_store=self._object_store,
            )

    async def _handle_human_interaction(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.human_interaction import (
            execute_human_interaction_tool,
        )

        return await execute_human_interaction_tool(
            name, args, publish_fn=self._publish_fn,
        )

    async def _handle_image_generation(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.image_generation import (
            execute_image_generation_tool,
        )

        return await execute_image_generation_tool(
            name, args, object_store=self._object_store,
        )

    async def _handle_custom_tools(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.custom_tools import execute_custom_tool

        async with self._session_maker() as session:
            return await execute_custom_tool(
                name, args,
                agent_id=self._agent_id,
                session=session,
                gateway_executor=self._gateway_executor,
            )

    async def _handle_mini_app(self, name: str, args: dict[str, Any]) -> str:
        from src.infra.config import get_settings

        from src.tools.categories.mini_apps import execute_mini_app_tool

        settings = get_settings()
        if not settings.PLATFORM_URL or not settings.ENGINE_API_KEY:
            return "Error: mini-apps require PLATFORM_URL and ENGINE_API_KEY."

        return await execute_mini_app_tool(
            name, args,
            agent_id=self._agent_id,
            platform_url=settings.PLATFORM_URL,
            engine_api_key=settings.ENGINE_API_KEY,
        )

    async def _handle_registered_custom_tool(self, name: str, args: dict[str, Any]) -> str:
        """Execute a registered custom tool (custom__<name> → custom_tool_run)."""
        from src.tools.categories.custom_tools import execute_custom_tool

        tool_name = name.removeprefix("custom__")
        async with self._session_maker() as session:
            return await execute_custom_tool(
                "custom_tool_run",
                {"tool_name": tool_name, "args": args},
                agent_id=self._agent_id,
                session=session,
                gateway_executor=self._gateway_executor,
            )
