"""Shared utilities for graph engine node creators."""

from __future__ import annotations

from typing import Any


def resolve_dot_path(state: dict, path: str) -> Any:
    """Resolve a dot-separated path against graph state.

    Examples:
        "node_outputs.search.results" -> state["node_outputs"]["search"]["results"]
        "input_data.items" -> state["input_data"]["items"]
    """
    if not path:
        return None
    parts = path.split(".")
    current = state
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current


def apply_mcp_tool_filter(
    tools: list[dict],
    gateway_permissions: dict | None,
) -> list[dict]:
    """Filter MCP tools based on gateway_permissions.mcp_tool_filter."""
    tool_filter = (gateway_permissions or {}).get("mcp_tool_filter")
    if not tool_filter or not tools:
        return tools
    return [
        t
        for t in tools
        if any(
            t.get("function", {}).get("name", "").endswith(f"_{tn}")
            for tn in tool_filter
        )
    ]
