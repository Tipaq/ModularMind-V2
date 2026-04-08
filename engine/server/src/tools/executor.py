"""Extended tool executor.

Dispatches tool calls to the appropriate category handler.
Follows the same async execute(name, args) -> str protocol
as MCPToolExecutor and GatewayToolExecutor.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.gateway.executor import GatewayToolExecutor
    from src.infra.object_store import ObjectStore
    from src.rag.retriever import RAGRetriever

logger = logging.getLogger(__name__)


@dataclass
class ToolExecutorDeps:
    rag_retriever: RAGRetriever | None = None
    object_store: ObjectStore | None = None
    gateway_executor: GatewayToolExecutor | None = None
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None = None
    execution_id: str | None = None


# Prefixes for routing tool calls to the correct handler
_CATEGORY_PREFIXES = (
    "knowledge_",
    "storage_",
    "human_",
    "image_",
    "custom_tool_",
    "custom__",
    "mini_app_",
    "github_",
    "web_",
    "browse_",
    "screenshot_",
    "extract_",
    "git_",
    "scheduling_",
    "connector__",
)


class ExtendedToolExecutor:
    """Executes extended tool calls by dispatching to category handlers."""

    def __init__(
        self,
        session_maker: Callable,
        user_id: str,
        agent_id: str,
        deps: ToolExecutorDeps | None = None,
    ):
        self._session_maker = session_maker
        self._user_id = user_id
        self._agent_id = agent_id
        resolved_deps = deps or ToolExecutorDeps()
        self._rag_retriever = resolved_deps.rag_retriever
        self._object_store = resolved_deps.object_store
        self._gateway_executor = resolved_deps.gateway_executor
        self._publish_fn = resolved_deps.publish_fn
        self._execution_id = resolved_deps.execution_id

    def handles(self, name: str) -> bool:
        """Check if this executor handles a tool name."""
        return any(name.startswith(prefix) for prefix in _CATEGORY_PREFIXES)

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        """Execute a tool by name, dispatching to the correct handler."""
        try:
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
            if name.startswith("github_"):
                return await self._handle_github(name, args)
            if name in ("web_search", "browse_url", "screenshot_url", "extract_links"):
                return await self._handle_web(name, args)
            if name.startswith("git_"):
                return await self._handle_git(name, args)
            if name.startswith("scheduling_"):
                return await self._handle_scheduling(name, args)
            if name.startswith("connector__"):
                return await self._handle_connector(name, args)
            return f"Error: unknown extended tool '{name}'"
        except (KeyError, ValueError, TypeError, RuntimeError, ConnectionError, TimeoutError) as e:
            logger.exception("Extended tool '%s' failed", name)
            return f"Error: {e}"

    async def _handle_knowledge(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.knowledge import execute_knowledge_tool

        async with self._session_maker() as session:
            return await execute_knowledge_tool(
                name,
                args,
                user_id=self._user_id,
                session=session,
                rag_retriever=self._rag_retriever,
            )

    async def _handle_storage(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.file_storage import execute_storage_tool

        async with self._session_maker() as session:
            return await execute_storage_tool(
                name,
                args,
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
            name,
            args,
            publish_fn=self._publish_fn,
            execution_id=self._execution_id,
        )

    async def _handle_image_generation(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.image_generation import (
            execute_image_generation_tool,
        )

        return await execute_image_generation_tool(
            name,
            args,
            object_store=self._object_store,
        )

    async def _handle_custom_tools(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.custom_tools import execute_custom_tool

        async with self._session_maker() as session:
            return await execute_custom_tool(
                name,
                args,
                agent_id=self._agent_id,
                session=session,
                gateway_executor=self._gateway_executor,
            )

    async def _handle_mini_app(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.mini_apps import execute_mini_app_tool

        async with self._session_maker() as session:
            return await execute_mini_app_tool(
                name,
                args,
                agent_id=self._agent_id,
                session=session,
            )

    async def _handle_web(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.web import execute_web_tool

        search_keys = await self._get_search_api_keys()
        return await execute_web_tool(
            name,
            args,
            search_api_keys=search_keys,
        )

    async def _get_search_api_keys(self) -> dict[str, str]:
        """Load search API keys from settings."""
        try:
            from src.infra.secrets import secrets_store

            return {
                "brave": secrets_store.get("SEARCH_BRAVE_API_KEY", ""),
                "tavily": secrets_store.get("SEARCH_TAVILY_API_KEY", ""),
                "serper": secrets_store.get("SEARCH_SERPER_API_KEY", ""),
            }
        except (ImportError, KeyError, AttributeError):
            return {}

    async def _handle_git(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.git import execute_git_tool

        github_token = None
        try:
            await self._get_search_api_keys()
            async with self._session_maker() as session:
                from src.tools.categories.github import resolve_token

                github_token = await resolve_token(session, self._agent_id)
        except (ImportError, KeyError, ValueError, ConnectionError, RuntimeError):
            pass
        return await execute_git_tool(name, args, github_token=github_token)

    async def _handle_github(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.github import execute_github_tool

        async with self._session_maker() as session:
            return await execute_github_tool(
                name,
                args,
                session=session,
                agent_id=self._agent_id,
            )

    async def _handle_scheduling(self, name: str, args: dict[str, Any]) -> str:
        from src.tools.categories.scheduling import execute_scheduling_tool

        async with self._session_maker() as session:
            return await execute_scheduling_tool(
                name,
                args,
                user_id=self._user_id,
                agent_id=self._agent_id,
                session=session,
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

    async def _handle_connector(self, name: str, args: dict[str, Any]) -> str:
        """Execute an outbound connector tool (connector__<type>__<action>)."""
        from src.tools.categories.connectors import execute_connector_tool

        async with self._session_maker() as session:
            return await execute_connector_tool(
                name,
                args,
                user_id=self._user_id,
                session=session,
            )
