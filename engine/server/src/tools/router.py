"""Tools admin router — unified view of all available tools."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from src.auth import RequireOwner

from .registry import DEFAULT_TOOL_CATEGORIES, _get_category_registry
from .schemas import ToolCategoryResponse, ToolDefinitionResponse, ToolsOverviewResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["Tools"])

CATEGORY_META: dict[str, dict[str, str]] = {
    "builtin": {"label": "Built-in", "description": "Core tools always available to agents"},
    "knowledge": {
        "label": "Knowledge",
        "description": "Search uploaded document collections (RAG)",
    },
    "filesystem": {
        "label": "Filesystem",
        "description": "Read, write, search, and manage workspace files",
    },
    "file_storage": {
        "label": "File Storage",
        "description": "Upload and manage files via S3",
    },
    "human_interaction": {
        "label": "Human Interaction",
        "description": "Send notifications and request user approval",
    },
    "image_generation": {
        "label": "Image Generation",
        "description": "Generate images via LLM providers",
    },
    "custom_tools": {
        "label": "Custom Tools",
        "description": "Agent-defined shell, HTTP, or Python tools",
    },
    "github": {
        "label": "GitHub",
        "description": "GitHub repos, issues, PRs, code search via API",
    },
    "web": {
        "label": "Web",
        "description": "Search, browse, screenshot, and extract links from the web",
    },
    "gateway": {
        "label": "Gateway",
        "description": "System access: shell, browser, network",
    },
}


def _extract_tool_defs(
    raw_tools: list[dict[str, Any]],
    category: str,
    source: str,
    server_name: str | None = None,
) -> list[ToolDefinitionResponse]:
    result: list[ToolDefinitionResponse] = []
    for tool in raw_tools:
        fn = tool.get("function", {})
        result.append(
            ToolDefinitionResponse(
                name=fn.get("name", ""),
                description=fn.get("description", ""),
                category=category,
                source=source,
                server_name=server_name,
                parameters=fn.get("parameters", {}),
            )
        )
    return result


def _collect_builtin_tools() -> list[ToolDefinitionResponse]:
    from src.graph_engine.builtin_tools import get_builtin_tool_definitions

    return _extract_tool_defs(get_builtin_tool_definitions(), "builtin", "builtin")


def _collect_extended_tools() -> dict[str, list[ToolDefinitionResponse]]:
    registry = _get_category_registry()
    by_category: dict[str, list[ToolDefinitionResponse]] = {}
    for category_name, definition_fn in registry.items():
        try:
            raw = definition_fn()
            by_category[category_name] = _extract_tool_defs(raw, category_name, "extended")
        except Exception:
            logger.exception("Failed to load tool category: %s", category_name)
            by_category[category_name] = []
    return by_category


def _collect_gateway_tools() -> list[ToolDefinitionResponse]:
    from src.gateway.tool_definitions import get_gateway_tool_definitions

    all_enabled_permissions = {
        "shell": {"enabled": True},
        "browser": {"enabled": True},
        "network": {"enabled": True},
    }
    raw = get_gateway_tool_definitions(all_enabled_permissions)
    return _extract_tool_defs(raw, "gateway", "gateway")


async def _collect_mcp_tools() -> dict[str, list[ToolDefinitionResponse]]:
    from src.mcp.service import get_mcp_registry

    registry = get_mcp_registry()
    by_server: dict[str, list[ToolDefinitionResponse]] = {}

    for server_id, config in registry._servers.items():
        if not config.enabled:
            continue
        try:
            mcp_tools = await registry.discover_tools(server_id)
            defs = [
                ToolDefinitionResponse(
                    name=t.name,
                    description=t.description or "",
                    category=f"mcp:{config.name}",
                    source="mcp",
                    server_name=config.name,
                    parameters=t.input_schema,
                )
                for t in mcp_tools
            ]
            by_server[config.name] = defs
        except Exception:
            logger.warning("Failed to discover MCP tools from %s", config.name)
            by_server[config.name] = []

    return by_server


@router.get("", response_model=ToolsOverviewResponse, dependencies=[RequireOwner])
async def list_tools() -> ToolsOverviewResponse:
    builtin = _collect_builtin_tools()
    extended = _collect_extended_tools()
    gateway = _collect_gateway_tools()

    try:
        mcp_by_server = await _collect_mcp_tools()
    except Exception:
        logger.warning("MCP tool discovery failed")
        mcp_by_server = {}

    all_tools: list[ToolDefinitionResponse] = []
    all_tools.extend(builtin)
    for tools in extended.values():
        all_tools.extend(tools)
    all_tools.extend(gateway)
    for tools in mcp_by_server.values():
        all_tools.extend(tools)

    categories: list[ToolCategoryResponse] = []

    categories.append(
        ToolCategoryResponse(
            id="builtin",
            label=CATEGORY_META["builtin"]["label"],
            description=CATEGORY_META["builtin"]["description"],
            tool_count=len(builtin),
            enabled_by_default=True,
        )
    )

    for cat_id in DEFAULT_TOOL_CATEGORIES:
        meta = CATEGORY_META.get(cat_id, {"label": cat_id, "description": ""})
        categories.append(
            ToolCategoryResponse(
                id=cat_id,
                label=meta["label"],
                description=meta["description"],
                tool_count=len(extended.get(cat_id, [])),
                enabled_by_default=DEFAULT_TOOL_CATEGORIES[cat_id],
            )
        )

    categories.append(
        ToolCategoryResponse(
            id="gateway",
            label=CATEGORY_META["gateway"]["label"],
            description=CATEGORY_META["gateway"]["description"],
            tool_count=len(gateway),
            enabled_by_default=False,
        )
    )

    mcp_tool_count = sum(len(t) for t in mcp_by_server.values())
    if mcp_tool_count > 0:
        categories.append(
            ToolCategoryResponse(
                id="mcp",
                label="MCP Servers",
                description="Tools from connected MCP servers",
                tool_count=mcp_tool_count,
                enabled_by_default=False,
            )
        )

    return ToolsOverviewResponse(
        categories=categories,
        tools=all_tools,
        total_count=len(all_tools),
    )
