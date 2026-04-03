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


