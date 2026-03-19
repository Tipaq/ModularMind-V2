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

    # Filesystem tools — always available if any read/write patterns exist
    fs = permissions.get("filesystem", {})
    if fs.get("read") or fs.get("write"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__fs_read",
                    "description": (
                        "Read the contents of a file from the workspace. "
                        "Paths are relative to /workspace/ (the agent's working directory)."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path to the file (e.g., /workspace/src/main.py)",
                            },
                        },
                        "required": ["path"],
                    },
                },
            }
        )

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__fs_list",
                    "description": (
                        "List files and directories in the workspace. "
                        "Returns file names, sizes, and types."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Directory path (default: /workspace)",
                            },
                            "recursive": {
                                "type": "boolean",
                                "description": "List recursively (default: false)",
                            },
                        },
                        "required": [],
                    },
                },
            }
        )

    if fs.get("write"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__fs_write",
                    "description": (
                        "Write content to a file in the workspace. "
                        "Creates parent directories if needed. Overwrites existing files."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path for the file (e.g., /workspace/output.txt)",
                            },
                            "content": {
                                "type": "string",
                                "description": "Content to write to the file",
                            },
                        },
                        "required": ["path", "content"],
                    },
                },
            }
        )

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__fs_delete",
                    "description": "Delete a file from the workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Absolute path to the file to delete",
                            },
                        },
                        "required": ["path"],
                    },
                },
            }
        )

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

    # Browser tools (Phase 6)
    browser = permissions.get("browser", {})
    if browser.get("enabled"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__browser_browse",
                    "description": "Browse a URL and return page content as text.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "URL to browse",
                            },
                        },
                        "required": ["url"],
                    },
                },
            }
        )

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__browser_search",
                    "description": (
                        "Search the web using DuckDuckGo and return results "
                        "with titles, URLs, and snippets."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query",
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Max results to return (default: 10, max: 25)",
                            },
                            "safesearch": {
                                "type": "string",
                                "enum": ["strict", "moderate", "off"],
                                "description": "SafeSearch filtering level (default: moderate)",
                            },
                        },
                        "required": ["query"],
                    },
                },
            }
        )

    # Code search tools
    code_search = permissions.get("code_search", {})
    if code_search.get("enabled"):
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__code_grep",
                    "description": (
                        "Search file contents in the workspace using regex patterns. "
                        "Returns matching lines with file paths and line numbers."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "Regex pattern to search for",
                            },
                            "path": {
                                "type": "string",
                                "description": "Directory to search (default: /workspace)",
                            },
                            "glob": {
                                "type": "string",
                                "description": "File glob filter (e.g., '*.py')",
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Max results (1-500, default 50)",
                            },
                            "context": {
                                "type": "integer",
                                "description": "Context lines around matches (0-5)",
                            },
                        },
                        "required": ["pattern"],
                    },
                },
            }
        )

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": "gateway__code_multi_edit",
                    "description": (
                        "Apply multiple text replacements to a file atomically."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "File path to edit",
                            },
                            "edits": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "old_text": {"type": "string"},
                                        "new_text": {"type": "string"},
                                    },
                                    "required": ["old_text", "new_text"],
                                },
                                "description": "List of replacements (max 50)",
                            },
                        },
                        "required": ["path", "edits"],
                    },
                },
            }
        )

    # Network tools (Phase 7)
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
