"""Shell tools — sandboxed command execution via Gateway."""

from __future__ import annotations

from typing import Any


def get_shell_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the shell category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "shell_exec",
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
    ]
