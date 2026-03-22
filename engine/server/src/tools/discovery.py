"""Supervisor tool discovery layer.

Exposes two meta-tools (``search_tools`` and ``use_tool``) that give the
supervisor access to *all* tool sources without binding dozens of tools
directly — avoiding tool sprawling while keeping full capability.

Inspired by Claude Code's deferred-tools pattern, adapted for LangChain's
immutable ``bind_tools()`` constraint.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

MAX_SEARCH_RESULTS = 10
MAX_DESCRIPTION_CHARS = 200

# Virtual category names that are not in the extended tool registry
VIRTUAL_CATEGORIES = {"mcp", "gateway", "builtin"}

ALL_CATEGORY_NAMES = [
    "knowledge",
    "scheduling",
    "web",
    "file_storage",
    "image_generation",
    "github",
    "git",
    "filesystem",
    "human_interaction",
    "custom_tools",
    "mini_apps",
    "mcp",
    "gateway",
    "builtin",
]


def get_discovery_tool_definitions() -> list[dict[str, Any]]:
    """Return the two meta-tool definitions in OpenAI function-calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": "search_tools",
                "description": (
                    "Search available tools by keyword or category. "
                    "Returns tool names, descriptions, and parameter schemas. "
                    "Always call this before use_tool to discover the right tool."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "Keyword to search across tool names and descriptions."
                            ),
                        },
                        "category": {
                            "type": "string",
                            "description": (
                                "Filter by category: knowledge, scheduling, web, "
                                "file_storage, image_generation, github, git, "
                                "filesystem, human_interaction, custom_tools, "
                                "mcp, gateway, builtin."
                            ),
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "use_tool",
                "description": (
                    "Execute a tool found via search_tools. "
                    "Pass the exact tool_name from search results and its arguments."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tool_name": {
                            "type": "string",
                            "description": "Exact tool name from search_tools results.",
                        },
                        "arguments": {
                            "type": "object",
                            "description": "The tool's parameters as shown by search_tools.",
                        },
                    },
                    "required": ["tool_name", "arguments"],
                },
            },
        },
    ]


def _extract_tool_info(tool_def: dict[str, Any], category: str) -> dict[str, Any]:
    """Extract a compact tool info dict from an OpenAI-format tool definition."""
    func = tool_def.get("function", {})
    description = (func.get("description") or "")[:MAX_DESCRIPTION_CHARS]
    return {
        "name": func.get("name", ""),
        "description": description,
        "parameters": func.get("parameters", {}),
        "category": category,
    }


def _matches_query(tool_info: dict[str, Any], query: str) -> bool:
    """Case-insensitive match on tool name and description."""
    query_lower = query.lower()
    name = tool_info.get("name", "").lower()
    description = tool_info.get("description", "").lower()
    return query_lower in name or query_lower in description


class ToolDiscoveryExecutor:
    """Handles ``search_tools`` and ``use_tool`` calls for the supervisor.

    Wraps all executor types into a single discovery + execution layer.
    """

    def __init__(
        self,
        extended_executor: Any | None,
        mcp_executor: Any | None,
        gateway_executor: Any | None,
        builtin_fn: Callable[..., Any] | None,
        builtin_names: set[str],
        mcp_tool_defs: list[dict[str, Any]],
        gateway_tool_defs: list[dict[str, Any]],
        allowed_categories: list[str] | None,
    ):
        self._extended = extended_executor
        self._mcp = mcp_executor
        self._gateway = gateway_executor
        self._builtin_fn = builtin_fn
        self._builtin_names = builtin_names
        self._mcp_tool_defs = mcp_tool_defs
        self._gateway_tool_defs = gateway_tool_defs
        self._allowed = set(allowed_categories) if allowed_categories else None

    def handles(self, name: str) -> bool:
        """Check if this executor handles a tool name."""
        return name in ("search_tools", "use_tool")

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        """Dispatch to search or use handler."""
        if name == "search_tools":
            return await self._handle_search(args)
        if name == "use_tool":
            return await self._handle_use(args)
        return f"Error: unknown discovery tool '{name}'"

    # ── search_tools ──────────────────────────────────────────

    async def _handle_search(self, args: dict[str, Any]) -> str:
        query = args.get("query", "")
        category_filter = args.get("category")
        results: list[dict[str, Any]] = []

        # Collect tool defs from all sources
        for category, defs in self._collect_tool_defs(category_filter):
            for tool_def in defs:
                info = _extract_tool_info(tool_def, category)
                if not query or _matches_query(info, query):
                    results.append(info)
                if len(results) >= MAX_SEARCH_RESULTS:
                    break
            if len(results) >= MAX_SEARCH_RESULTS:
                break

        if not results:
            return "No tools found matching your search."

        return json.dumps(results, ensure_ascii=False)

    def _collect_tool_defs(
        self,
        category_filter: str | None,
    ) -> list[tuple[str, list[dict[str, Any]]]]:
        """Collect tool definitions from all sources, respecting filters."""
        from src.graph_engine.builtin_tools import get_builtin_tool_definitions
        from src.tools.registry import get_category_registry

        collected: list[tuple[str, list[dict[str, Any]]]] = []
        registry = get_category_registry()

        # Extended categories (from registry)
        for cat_name, getter_fn in registry.items():
            if not self._is_category_allowed(cat_name):
                continue
            if category_filter and category_filter != cat_name:
                continue
            collected.append((cat_name, getter_fn()))

        # MCP tools (virtual category)
        if (
            self._is_category_allowed("mcp")
            and self._mcp_tool_defs
            and (not category_filter or category_filter == "mcp")
        ):
            collected.append(("mcp", self._mcp_tool_defs))

        # Gateway tools (virtual category)
        if (
            self._is_category_allowed("gateway")
            and self._gateway_tool_defs
            and (not category_filter or category_filter == "gateway")
        ):
            collected.append(("gateway", self._gateway_tool_defs))

        # Builtin tools (virtual category)
        if (
            self._is_category_allowed("builtin")
            and self._builtin_fn
            and (not category_filter or category_filter == "builtin")
        ):
            collected.append(("builtin", get_builtin_tool_definitions()))

        return collected

    def _is_category_allowed(self, category: str) -> bool:
        """Check if a category is allowed by config (None = all allowed)."""
        if self._allowed is None:
            return True
        return category in self._allowed

    # ── use_tool ──────────────────────────────────────────────

    async def _handle_use(self, args: dict[str, Any]) -> str:
        tool_name = args.get("tool_name", "")
        tool_args = args.get("arguments", {})

        if not tool_name:
            return "Error: tool_name is required."

        if not isinstance(tool_args, dict):
            return "Error: arguments must be an object."

        try:
            return await self._dispatch(tool_name, tool_args)
        except Exception as exc:
            logger.exception("use_tool dispatch failed for '%s'", tool_name)
            return f"Error executing '{tool_name}': {exc}"

    async def _dispatch(self, name: str, args: dict[str, Any]) -> str:
        """Route tool call to the correct executor (same logic as UnifiedToolExecutor)."""
        if name in self._builtin_names and self._builtin_fn:
            return await self._builtin_fn(name, args)

        if name.startswith("gateway__") and self._gateway:
            return await self._gateway.execute(name, args)

        if self._extended and self._extended.handles(name):
            return await self._extended.execute(name, args)

        if self._mcp:
            return await self._mcp.execute(name, args)

        return f"Error: unknown tool '{name}'. Use search_tools to find available tools."
