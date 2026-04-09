"""Tool category registry.

Resolves which tool definitions to include based on agent configuration.
Each category maps to a function that returns OpenAI-compatible tool defs.
MCP categories use ``mcp:{server_name}`` keys and are resolved dynamically.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from src.infra.constants import DEFAULT_TOOL_CATEGORIES  # noqa: F401 — re-exported

if TYPE_CHECKING:
    from src.mcp.registry import MCPRegistry
    from src.mcp.tool_adapter import MCPToolExecutor

logger = logging.getLogger(__name__)


def get_category_registry() -> dict[str, Callable[[], list[dict[str, Any]]]]:
    """Lazy import to avoid circular dependencies."""
    from src.tools.categories.custom_tools import get_custom_tool_definitions
    from src.tools.categories.file_storage import get_file_storage_tool_definitions
    from src.tools.categories.filesystem import get_filesystem_tool_definitions
    from src.tools.categories.git import get_git_tool_definitions
    from src.tools.categories.github import get_github_tool_definitions
    from src.tools.categories.human_interaction import (
        get_human_interaction_tool_definitions,
    )
    from src.tools.categories.image_generation import (
        get_image_generation_tool_definitions,
    )
    from src.tools.categories.knowledge import get_knowledge_tool_definitions
    from src.tools.categories.mini_apps import get_mini_app_tool_definitions
    from src.tools.categories.network import get_network_tool_definitions
    from src.tools.categories.scheduling import get_scheduling_tool_definitions
    from src.tools.categories.shell import get_shell_tool_definitions
    from src.tools.categories.system_indexer import get_system_indexer_tool_definitions
    from src.tools.categories.web import get_web_tool_definitions

    return {
        "knowledge": get_knowledge_tool_definitions,
        "filesystem": get_filesystem_tool_definitions,
        "shell": get_shell_tool_definitions,
        "network": get_network_tool_definitions,
        "file_storage": get_file_storage_tool_definitions,
        "human_interaction": get_human_interaction_tool_definitions,
        "image_generation": get_image_generation_tool_definitions,
        "custom_tools": get_custom_tool_definitions,
        "mini_apps": get_mini_app_tool_definitions,
        "github": get_github_tool_definitions,
        "web": get_web_tool_definitions,
        "git": get_git_tool_definitions,
        "scheduling": get_scheduling_tool_definitions,
        "system_indexer": get_system_indexer_tool_definitions,
    }


def resolve_tool_definitions(
    tool_categories: dict[str, bool | dict[str, bool]],
) -> list[dict[str, Any]]:
    """Return tool definitions for all enabled categories.

    Args:
        tool_categories: Map of category name to enabled flag or per-tool overrides.
            - ``True``: all tools in category enabled.
            - ``False``: category disabled.
            - ``dict[str, bool]``: per-tool overrides (category considered enabled).

    Returns:
        Combined list of OpenAI-compatible tool definitions.
    """
    registry = get_category_registry()
    tools: list[dict[str, Any]] = []

    for category, enabled in tool_categories.items():
        if enabled is False:
            continue
        definition_fn = registry.get(category)
        if not definition_fn:
            logger.warning("Unknown tool category: %s", category)
            continue
        category_tools = definition_fn()
        if isinstance(enabled, dict):
            category_tools = [
                t for t in category_tools
                if enabled.get(t["function"]["name"], False)
            ]
        tools.extend(category_tools)
        logger.debug("Category '%s': %d tools", category, len(category_tools))

    return tools


async def resolve_registered_custom_tools(
    agent_id: str,
    session_maker: Callable,
) -> list[dict[str, Any]]:
    """Load agent's registered custom tools from DB and return as LLM tool definitions.

    Each registered custom tool becomes a callable tool for the LLM,
    routed through custom_tool_run internally.
    """
    from sqlalchemy import select

    from src.tools.models import CustomTool

    try:
        async with session_maker() as session:
            result = await session.execute(
                select(CustomTool).where(
                    CustomTool.agent_id == agent_id, CustomTool.is_active.is_(True)
                )
            )
            tools = list(result.scalars().all())

        if not tools:
            return []

        definitions = []
        for tool in tools:
            has_params = isinstance(tool.parameters, dict) and tool.parameters
            parameters = (
                tool.parameters
                if has_params
                else {
                    "type": "object",
                    "properties": {},
                    "required": [],
                }
            )
            if "type" not in parameters:
                parameters = {"type": "object", "properties": parameters, "required": []}

            definitions.append(
                {
                    "type": "function",
                    "function": {
                        "name": f"custom__{tool.name}",
                        "description": f"[Custom Tool] {tool.description}",
                        "parameters": parameters,
                    },
                }
            )

        logger.info("Agent '%s': loaded %d registered custom tools", agent_id, len(definitions))
        return definitions

    except Exception:
        logger.exception("Failed to load custom tools for agent '%s'", agent_id)
        return []


CONNECTOR_TOOL_PREFIX = "connector__"


async def resolve_connector_tool_definitions(
    user_id: str,
    project_ids: list[str],
    session_maker: Callable,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Load outbound connector tools visible to this user.

    Uses raw SQL to avoid ORM mapper initialization issues
    (UserGroupMember circular import).

    Returns:
        Tuple of (tool_definitions, tool_map).
        tool_map maps namespaced tool name → connector_id.
    """
    from re import sub as re_sub

    from sqlalchemy import text

    try:
        async with session_maker() as session:
            if project_ids:
                query = text(
                    "SELECT id, name, connector_type, spec FROM connectors "
                    "WHERE is_enabled = true AND spec IS NOT NULL AND ("
                    "  user_id = :user_id "
                    "  OR (user_id IS NULL AND project_id IS NULL) "
                    "  OR project_id = ANY(:project_ids)"
                    ")"
                )
                result = await session.execute(
                    query, {"user_id": user_id, "project_ids": project_ids}
                )
            else:
                query = text(
                    "SELECT id, name, connector_type, spec FROM connectors "
                    "WHERE is_enabled = true AND spec IS NOT NULL AND ("
                    "  user_id = :user_id "
                    "  OR (user_id IS NULL AND project_id IS NULL)"
                    ")"
                )
                result = await session.execute(
                    query, {"user_id": user_id}
                )

            rows = result.fetchall()

        if not rows:
            return [], {}

        definitions: list[dict[str, Any]] = []
        tool_map: dict[str, str] = {}

        for row in rows:
            connector_id = row[0]
            connector_name = row[1]
            connector_type = row[2]
            spec = row[3] or {}

            outbound_tools = spec.get("outbound", {}).get("tools", [])
            slug = re_sub(r"[^a-z0-9_]", "_", connector_type.lower())

            for tool in outbound_tools:
                tool_name = tool.get("name", "")
                if not tool_name:
                    continue
                ns_name = f"{CONNECTOR_TOOL_PREFIX}{slug}__{tool_name}"
                definitions.append({
                    "type": "function",
                    "function": {
                        "name": ns_name,
                        "description": (
                            f"[{connector_name}] "
                            f"{tool.get('description', '')}"
                        ),
                        "parameters": tool.get("input_schema", {
                            "type": "object",
                            "properties": {},
                        }),
                    },
                })
                tool_map[ns_name] = connector_id

        logger.info(
            "User '%s': loaded %d connector tools from %d connectors",
            user_id[:8],
            len(definitions),
            len(rows),
        )
        return definitions, tool_map

    except Exception:
        logger.exception(
            "Failed to load connector tools for user '%s'", user_id[:8]
        )
        return [], {}


MCP_CATEGORY_PREFIX = "mcp:"


async def resolve_mcp_tool_definitions(
    tool_categories: dict[str, bool | dict[str, bool]],
    mcp_registry: MCPRegistry,
) -> tuple[list[dict[str, Any]], MCPToolExecutor | None, dict[str, list[dict[str, Any]]]]:
    """Resolve MCP tool definitions from ``mcp:*`` keys in tool_categories.

    Iterates keys starting with ``mcp:``, looks up the server by name,
    discovers its tools, applies per-tool filtering, and converts to
    LangChain format with proper namespacing.

    Args:
        tool_categories: Agent's tool_categories dict. Only ``mcp:*`` keys are processed.
        mcp_registry: The MCP registry instance.

    Returns:
        Tuple of ``(langchain_tool_dicts, MCPToolExecutor, tools_by_server_name)``
        or ``([], None, {})``. ``tools_by_server_name`` maps server display
        names to their LangChain tool definitions (used by auto tool mode).
    """
    from src.mcp.tool_adapter import (
        MCPToolExecutor,
        _namespace_tool_name,
        _slugify_server_name,
        _tool_to_langchain_dict,
    )

    all_lc_tools: list[dict[str, Any]] = []
    tool_map: dict[str, tuple[str, str]] = {}
    tools_by_server: dict[str, list[dict[str, Any]]] = {}

    for key, value in tool_categories.items():
        if not key.startswith(MCP_CATEGORY_PREFIX):
            continue
        if value is False:
            continue

        server_name = key[len(MCP_CATEGORY_PREFIX) :]
        server = mcp_registry.get_server_by_name(server_name)
        if not server:
            logger.warning("MCP category '%s': server not found, skipping", key)
            continue
        if not server.enabled:
            logger.debug("MCP category '%s': server disabled, skipping", key)
            continue

        try:
            mcp_tools = await mcp_registry.discover_tools(server.id)
        except Exception:
            logger.warning("MCP category '%s': tool discovery failed", key, exc_info=True)
            continue

        if isinstance(value, dict):
            mcp_tools = [t for t in mcp_tools if value.get(t.name, False)]

        slug = _slugify_server_name(server.name)
        for tool in mcp_tools:
            ns_name = _namespace_tool_name(slug, tool.name)
            lc_def = _tool_to_langchain_dict(ns_name, tool)
            all_lc_tools.append(lc_def)
            tool_map[ns_name] = (server.id, tool.name)
            tools_by_server.setdefault(server_name, []).append(lc_def)

    if not all_lc_tools:
        return [], None, {}

    executor = MCPToolExecutor(mcp_registry, tool_map)
    return all_lc_tools, executor, tools_by_server
