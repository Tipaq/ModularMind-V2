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
    "memory": True,
    "knowledge": True,
    "code_search": False,
    "file_storage": False,
    "human_interaction": True,
    "image_generation": False,
    "custom_tools": False,
}


def _get_category_registry() -> dict[str, Callable[[], list[dict[str, Any]]]]:
    """Lazy import to avoid circular dependencies."""
    from src.tools.categories.code_search import get_code_search_tool_definitions
    from src.tools.categories.custom_tools import get_custom_tool_definitions
    from src.tools.categories.file_storage import get_file_storage_tool_definitions
    from src.tools.categories.human_interaction import (
        get_human_interaction_tool_definitions,
    )
    from src.tools.categories.image_generation import (
        get_image_generation_tool_definitions,
    )
    from src.tools.categories.knowledge import get_knowledge_tool_definitions
    from src.tools.categories.memory import get_memory_tool_definitions

    return {
        "memory": get_memory_tool_definitions,
        "knowledge": get_knowledge_tool_definitions,
        "code_search": get_code_search_tool_definitions,
        "file_storage": get_file_storage_tool_definitions,
        "human_interaction": get_human_interaction_tool_definitions,
        "image_generation": get_image_generation_tool_definitions,
        "custom_tools": get_custom_tool_definitions,
    }


def resolve_tool_definitions(tool_categories: dict[str, bool]) -> list[dict[str, Any]]:
    """Return tool definitions for all enabled categories.

    Args:
        tool_categories: Map of category name to enabled flag.

    Returns:
        Combined list of OpenAI-compatible tool definitions.
    """
    registry = _get_category_registry()
    tools: list[dict[str, Any]] = []

    for category, enabled in tool_categories.items():
        if not enabled:
            continue
        definition_fn = registry.get(category)
        if not definition_fn:
            logger.warning("Unknown tool category: %s", category)
            continue
        category_tools = definition_fn()
        tools.extend(category_tools)
        logger.debug("Category '%s': %d tools", category, len(category_tools))

    return tools
