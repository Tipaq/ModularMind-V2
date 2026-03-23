"""Tool category registry.

Resolves which tool definitions to include based on agent configuration.
Each category maps to a function that returns OpenAI-compatible tool defs.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

# Default tool_categories for agents that don't specify one
DEFAULT_TOOL_CATEGORIES: dict[str, bool] = {
    "knowledge": True,
    "filesystem": False,
    "shell": False,
    "network": False,
    "file_storage": False,
    "human_interaction": True,
    "image_generation": False,
    "custom_tools": False,
    "github": False,
    "web": False,
    "git": False,
    "scheduling": False,
}


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
                if enabled.get(t["function"]["name"], True)
            ]
        tools.extend(category_tools)
        logger.debug("Category '%s': %d tools", category, len(category_tools))

    return tools


async def resolve_registered_custom_tools(
    agent_id: str, session_maker: Callable,
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
                select(CustomTool)
                .where(CustomTool.agent_id == agent_id, CustomTool.is_active.is_(True))
            )
            tools = list(result.scalars().all())

        if not tools:
            return []

        definitions = []
        for tool in tools:
            has_params = isinstance(tool.parameters, dict) and tool.parameters
            parameters = tool.parameters if has_params else {
                "type": "object", "properties": {}, "required": [],
            }
            if "type" not in parameters:
                parameters = {"type": "object", "properties": parameters, "required": []}

            definitions.append({
                "type": "function",
                "function": {
                    "name": f"custom__{tool.name}",
                    "description": f"[Custom Tool] {tool.description}",
                    "parameters": parameters,
                },
            })

        logger.info("Agent '%s': loaded %d registered custom tools", agent_id, len(definitions))
        return definitions

    except Exception:
        logger.exception("Failed to load custom tools for agent '%s'", agent_id)
        return []
