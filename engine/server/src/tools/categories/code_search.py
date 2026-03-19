"""Code search tool definitions — delegated to Gateway.

These tools generate gateway__code_* definitions that are dispatched
through the Gateway executor (Docker sandbox). The actual execution
happens in gateway/src/executors/code_search.py.
"""

from __future__ import annotations

from typing import Any


def get_code_search_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for code search category.

    These are gateway-delegated tools (prefix: gateway__code_*).
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "gateway__code_grep",
                "description": (
                    "Search file contents in the workspace using regex patterns. "
                    "Returns matching lines with file paths, line numbers, and context. "
                    "Useful for finding code patterns, function definitions, or text."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "Regex pattern to search for.",
                        },
                        "path": {
                            "type": "string",
                            "description": "Directory to search in (default: /workspace).",
                        },
                        "glob": {
                            "type": "string",
                            "description": "File glob filter (e.g., '*.py', '*.ts').",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Max matching lines to return (1-500, default 50).",
                        },
                        "context": {
                            "type": "integer",
                            "description": "Lines of context before/after each match (0-5, default 0).",
                        },
                    },
                    "required": ["pattern"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__code_multi_edit",
                "description": (
                    "Apply multiple text replacements to a file atomically. "
                    "All edits are applied sequentially; if any fails, the file "
                    "is left unchanged. Use this for refactoring or batch changes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute path to the file to edit.",
                        },
                        "edits": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "old_text": {
                                        "type": "string",
                                        "description": "Text to find (exact match).",
                                    },
                                    "new_text": {
                                        "type": "string",
                                        "description": "Replacement text.",
                                    },
                                },
                                "required": ["old_text", "new_text"],
                            },
                            "description": "List of replacements to apply (max 50).",
                        },
                    },
                    "required": ["path", "edits"],
                },
            },
        },
    ]
