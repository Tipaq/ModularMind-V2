"""Gateway tool definitions — DEPRECATED.

Shell, network, and filesystem tools are now defined in their respective
tool categories (tools/categories/shell.py, network.py, filesystem.py).
This module is kept for backward compatibility with existing imports.
"""

from __future__ import annotations

from typing import Any


def get_gateway_tool_definitions(permissions: dict[str, Any]) -> list[dict]:
    """Return empty list — tools are now in their respective categories."""
    return []
