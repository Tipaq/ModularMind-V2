"""Mini-app tools — agents create and manage web applications."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_mini_app_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for mini-apps category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "mini_app_create",
                "description": (
                    "Create a new mini web application. Returns the app ID. "
                    "You can optionally provide initial HTML content."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "App display name."},
                        "slug": {"type": "string", "description": "URL-safe identifier (lowercase, hyphens)."},
                        "description": {"type": "string", "description": "What the app does."},
                        "scope": {
                            "type": "string",
                            "enum": ["GLOBAL", "GROUP", "PERSONAL"],
                            "description": "Visibility scope (default: PERSONAL).",
                        },
                        "html": {"type": "string", "description": "Initial HTML content for index.html."},
                    },
                    "required": ["name", "slug"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_write_file",
                "description": (
                    "Write or update a file in a mini-app. Supports HTML, JS, CSS, "
                    "JSON, and other text files. Use is_base64 for binary files."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                        "path": {"type": "string", "description": "File path (e.g., 'index.html', 'js/app.js')."},
                        "content": {"type": "string", "description": "File content."},
                        "content_type": {"type": "string", "description": "MIME type (default: auto-detect)."},
                        "is_base64": {"type": "boolean", "description": "Content is base64-encoded (default: false)."},
                    },
                    "required": ["app_id", "path", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_read_file",
                "description": "Read a file from a mini-app.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                        "path": {"type": "string", "description": "File path to read."},
                    },
                    "required": ["app_id", "path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_list_files",
                "description": "List all files in a mini-app with sizes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                    },
                    "required": ["app_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_update",
                "description": "Update mini-app metadata (name, description, icon, scope).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "icon": {"type": "string"},
                        "scope": {"type": "string", "enum": ["GLOBAL", "GROUP", "PERSONAL"]},
                    },
                    "required": ["app_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_delete",
                "description": "Delete a mini-app and all its files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                    },
                    "required": ["app_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_list",
                "description": "List all mini-apps created by this agent.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mini_app_storage_set",
                "description": "Set a key-value pair in mini-app persistent storage.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "app_id": {"type": "string", "description": "Mini-app ID."},
                        "key": {"type": "string", "description": "Storage key (max 256 chars)."},
                        "value": {"description": "Value to store (any JSON-serializable type)."},
                    },
                    "required": ["app_id", "key", "value"],
                },
            },
        },
    ]


async def execute_mini_app_tool(
    name: str,
    args: dict[str, Any],
    agent_id: str,
    platform_url: str,
    engine_api_key: str,
) -> str:
    """Execute a mini-app tool by proxying to Platform API."""
    import httpx

    headers = {"X-Engine-Key": engine_api_key, "Content-Type": "application/json"}
    base = f"{platform_url}/api/mini-apps"

    try:
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
            if name == "mini_app_create":
                resp = await client.post(base, json={
                    "name": args.get("name", ""),
                    "slug": args.get("slug", ""),
                    "description": args.get("description", ""),
                    "scope": args.get("scope", "PERSONAL"),
                    "agentId": agent_id,
                    "html": args.get("html"),
                })
                resp.raise_for_status()
                app = resp.json()
                return json.dumps({"id": app["id"], "name": app["name"], "slug": app["slug"]})

            if name == "mini_app_write_file":
                app_id = args.get("app_id", "")
                resp = await client.post(f"{base}/{app_id}/files", json={
                    "path": args.get("path", ""),
                    "content": args.get("content", ""),
                    "content_type": args.get("content_type", "text/plain"),
                    "is_base64": args.get("is_base64", False),
                })
                resp.raise_for_status()
                return f"File '{args.get('path')}' written to app {app_id}."

            if name == "mini_app_read_file":
                app_id = args.get("app_id", "")
                path = args.get("path", "")
                resp = await client.get(f"{base}/{app_id}/files/{path}")
                resp.raise_for_status()
                return resp.text[:10000]

            if name == "mini_app_list_files":
                app_id = args.get("app_id", "")
                resp = await client.get(f"{base}/{app_id}/files")
                resp.raise_for_status()
                files = resp.json()
                if not files:
                    return "No files in this app."
                parts = [f"- {f['path']} ({f['sizeBytes']} bytes, {f['contentType']})" for f in files]
                return "\n".join(parts)

            if name == "mini_app_update":
                app_id = args.get("app_id", "")
                body = {k: v for k, v in args.items() if k != "app_id" and v is not None}
                resp = await client.patch(f"{base}/{app_id}", json=body)
                resp.raise_for_status()
                return f"App {app_id} updated."

            if name == "mini_app_delete":
                app_id = args.get("app_id", "")
                resp = await client.delete(f"{base}/{app_id}")
                resp.raise_for_status()
                return f"App {app_id} deleted."

            if name == "mini_app_list":
                resp = await client.get(base, params={"agentId": agent_id})
                resp.raise_for_status()
                data = resp.json()
                items = data.get("items", data) if isinstance(data, dict) else data
                if not items:
                    return "No mini-apps found."
                parts = [f"- **{a['name']}** (id: {a['id']}, scope: {a.get('scope', '?')})" for a in items]
                return "\n".join(parts)

            if name == "mini_app_storage_set":
                app_id = args.get("app_id", "")
                key = args.get("key", "")
                value = args.get("value")
                resp = await client.put(f"{base}/{app_id}/storage/{key}", json={"value": value})
                resp.raise_for_status()
                return f"Storage key '{key}' set."

        return f"Error: unknown mini-app tool '{name}'"

    except httpx.HTTPStatusError as e:
        return f"Error: Platform API returned {e.response.status_code}: {e.response.text[:500]}"
    except Exception as e:
        logger.exception("Mini-app tool '%s' failed", name)
        return f"Error: {e}"
