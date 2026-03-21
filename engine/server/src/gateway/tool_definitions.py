"""Gateway tool definitions in OpenAI function-calling format.

Generated dynamically based on agent's gateway_permissions.
Only tools for enabled categories are included.
"""

from __future__ import annotations

from typing import Any


def get_gateway_tool_definitions(permissions: dict[str, Any]) -> list[dict]:
    """Build OpenAI-compatible tool definitions from gateway permissions.

    Args:
        permissions: The gateway_permissions dict from agent config.

    Returns:
        List of tool definitions in OpenAI function-calling format.
    """
    tools: list[dict] = []

    # Filesystem tools are now defined by tool_categories.filesystem
    # (see tools/categories/filesystem.py). Gateway permissions still
    # control what the gateway *allows*, but definitions come from the
    # filesystem category — no longer duplicated here.

    # Shell tools
    shell = permissions.get("shell", {})
    if shell.get("enabled"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__shell_exec",
                    "description": (
                        "Execute a shell command in the workspace sandbox. "
                        "Runs as non-root user with restricted capabilities. "
                        "Working directory is /workspace."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "Shell command to execute",
                            },
                        },
                        "required": ["command"],
                    },
                },
            }
        )

    # Browser/web tools are now in tool_categories.web
    # (see tools/categories/web.py)

    # Network tools
    network = permissions.get("network", {})
    if network.get("enabled"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__net_request",
                    "description": "Make an HTTP request to an external API.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "URL to request",
                            },
                            "method": {
                                "type": "string",
                                "description": "HTTP method (GET, POST, etc.)",
                                "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                            },
                            "body": {
                                "type": "string",
                                "description": "Request body (for POST/PUT/PATCH)",
                            },
                            "headers": {
                                "type": "object",
                                "description": "Request headers",
                            },
                        },
                        "required": ["url"],
                    },
                },
            }
        )

    return tools
