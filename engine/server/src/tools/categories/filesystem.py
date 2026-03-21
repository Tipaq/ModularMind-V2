"""Filesystem tools — unified file operations delegated to Gateway.

Replaces the separate filesystem + code_search gateway categories with a
single, enriched tool set. Operations are split into two security groups:

- **safe** (read, list, search, metadata): can run via direct subprocess
- **critical** (write, edit, delete, move, mkdir): routed through Docker sandbox

The safe/critical split is configurable globally via domain_config.
"""

from __future__ import annotations

from typing import Any


def get_filesystem_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the filesystem category."""
    return [
        *_safe_tool_definitions(),
        *_critical_tool_definitions(),
    ]


def _safe_tool_definitions() -> list[dict[str, Any]]:
    """Read-only / non-destructive operations."""
    return [
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_read",
                "description": (
                    "Read a text file from the workspace. "
                    "Supports head/tail to read only the first or last N lines."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the file (e.g. /workspace/src/main.py).",
                        },
                        "head": {
                            "type": "integer",
                            "description": "Read only the first N lines.",
                        },
                        "tail": {
                            "type": "integer",
                            "description": "Read only the last N lines.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_read_media",
                "description": (
                    "Read a binary file (image, audio, etc.) and return it "
                    "as base64-encoded content with its MIME type."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the binary file.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_read_multiple",
                "description": (
                    "Read multiple text files in one call. "
                    "Returns content for each file; individual failures are non-fatal."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "paths": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of file paths to read (max 20).",
                        },
                    },
                    "required": ["paths"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_list",
                "description": (
                    "List files and directories in a workspace directory. "
                    "Returns names, sizes, and types."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory path (default: /workspace).",
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "List recursively up to 3 levels deep (default: false).",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_list_with_sizes",
                "description": (
                    "List files with sizes and sort options. "
                    "Useful for finding large files or recent changes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory path (default: /workspace).",
                        },
                        "sort": {
                            "type": "string",
                            "enum": ["name", "size", "time"],
                            "description": "Sort order (default: name).",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_tree",
                "description": (
                    "Display the directory tree structure recursively. "
                    "Returns an indented tree view of files and directories."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Root directory (default: /workspace).",
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Maximum depth to traverse (1-5, default: 3).",
                        },
                        "exclude": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Glob patterns to exclude (e.g. ['node_modules', '.git']).",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_info",
                "description": (
                    "Get file metadata: size, timestamps, permissions, and type."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the file or directory.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_search",
                "description": (
                    "Search file contents using regex patterns. "
                    "Returns matching lines with file paths, line numbers, and context."
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
                            "description": "File glob filter (e.g. '*.py', '*.ts').",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Max matching lines to return (1-500, default: 50).",
                        },
                        "context": {
                            "type": "integer",
                            "description": "Lines of context before/after each match (0-5, default: 0).",
                        },
                    },
                    "required": ["pattern"],
                },
            },
        },
    ]


def _critical_tool_definitions() -> list[dict[str, Any]]:
    """Write / destructive operations — sandbox-enforced by default."""
    return [
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_write",
                "description": (
                    "Write content to a file. Creates parent directories if needed. "
                    "Overwrites existing files."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path for the file (e.g. /workspace/output.txt).",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write to the file.",
                        },
                    },
                    "required": ["path", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_edit",
                "description": (
                    "Apply multiple text replacements to a file atomically. "
                    "All edits are validated before writing. Supports dry-run mode."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the file to edit.",
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
                        "dry_run": {
                            "type": "boolean",
                            "description": "Preview changes without applying (default: false).",
                        },
                    },
                    "required": ["path", "edits"],
                },
            },
        },
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
                            "description": "Path to the file to delete.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_move",
                "description": "Move or rename a file or directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "description": "Current path of the file or directory.",
                        },
                        "destination": {
                            "type": "string",
                            "description": "New path for the file or directory.",
                        },
                    },
                    "required": ["source", "destination"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gateway__fs_mkdir",
                "description": "Create a directory (with parent directories if needed).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path of the directory to create.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
    ]


# Tool names by security group — used by the gateway to decide execution mode.
SAFE_ACTIONS = frozenset({
    "read", "read_media", "read_multiple",
    "list", "list_with_sizes", "tree", "info", "search",
})

CRITICAL_ACTIONS = frozenset({
    "write", "edit", "delete", "move", "mkdir",
})
