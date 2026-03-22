"""File storage tools — upload, manage, and share files via MinIO/S3."""

from __future__ import annotations

import base64
import json
import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "agent-files"


def get_file_storage_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for file storage category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "storage_upload",
                "description": (
                    "Store a file and get a shareable URL. Supports text content "
                    "or base64-encoded binary data."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "File name (e.g., 'report.pdf', 'data.csv').",
                        },
                        "content": {
                            "type": "string",
                            "description": "File content (text or base64-encoded).",
                        },
                        "content_type": {
                            "type": "string",
                            "description": "MIME type (default: text/plain).",
                        },
                        "is_base64": {
                            "type": "boolean",
                            "description": "Whether content is base64-encoded (default: false).",
                        },
                    },
                    "required": ["name", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "storage_get",
                "description": "Get metadata and a pre-signed download URL for a stored file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_id": {
                            "type": "string",
                            "description": "ID of the stored file.",
                        },
                    },
                    "required": ["file_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "storage_list",
                "description": "List stored files with names, sizes, and dates.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max files to return (1-100, default 50).",
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Offset for pagination (default: 0).",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "storage_search",
                "description": "Search stored files by name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query to match against file names.",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "storage_update",
                "description": "Update file metadata (name, description).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_id": {
                            "type": "string",
                            "description": "ID of the stored file.",
                        },
                        "name": {
                            "type": "string",
                            "description": "New file name.",
                        },
                        "description": {
                            "type": "string",
                            "description": "New description.",
                        },
                    },
                    "required": ["file_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "storage_delete",
                "description": "Permanently delete a stored file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_id": {
                            "type": "string",
                            "description": "ID of the file to delete.",
                        },
                    },
                    "required": ["file_id"],
                },
            },
        },
    ]


async def execute_storage_tool(
    name: str,
    args: dict[str, Any],
    user_id: str,
    agent_id: str,
    session: AsyncSession,
    object_store: Any | None = None,
) -> str:
    """Execute a file storage tool."""
    if not object_store:
        return "Error: file storage is not configured (no object store)."

    if name == "storage_upload":
        return await _storage_upload(args, user_id, agent_id, session, object_store)
    if name == "storage_get":
        return await _storage_get(args, session, object_store)
    if name == "storage_list":
        return await _storage_list(args, user_id, session)
    if name == "storage_search":
        return await _storage_search(args, user_id, session)
    if name == "storage_update":
        return await _storage_update(args, session)
    if name == "storage_delete":
        return await _storage_delete(args, session, object_store)
    return f"Error: unknown storage tool '{name}'"


async def _storage_upload(
    args: dict, user_id: str, agent_id: str,
    session: AsyncSession, object_store: Any,
) -> str:
    from src.tools.models import StoredFile

    file_name = args.get("name", "").strip()
    if not file_name:
        return "Error: name is required."

    content_str = args.get("content", "")
    content_type = args.get("content_type", "text/plain")
    is_base64 = args.get("is_base64", False)

    data = base64.b64decode(content_str) if is_base64 else content_str.encode("utf-8")

    file_id = str(uuid4())
    s3_key = f"agents/{agent_id}/{file_id}/{file_name}"

    await object_store.upload(STORAGE_BUCKET, s3_key, data, content_type)

    stored = StoredFile(
        id=file_id,
        agent_id=agent_id,
        user_id=user_id,
        name=file_name,
        content_type=content_type,
        size_bytes=len(data),
        s3_bucket=STORAGE_BUCKET,
        s3_key=s3_key,
    )
    session.add(stored)
    await session.commit()

    url = await object_store.presigned_url(STORAGE_BUCKET, s3_key)
    return json.dumps({"id": file_id, "name": file_name, "size": len(data), "url": url})


async def _storage_get(args: dict, session: AsyncSession, object_store: Any) -> str:
    from src.tools.models import StoredFile

    file_id = args.get("file_id", "").strip()
    if not file_id:
        return "Error: file_id is required."

    result = await session.execute(select(StoredFile).where(StoredFile.id == file_id))
    stored = result.scalar_one_or_none()
    if not stored:
        return f"Error: file '{file_id}' not found."

    url = await object_store.presigned_url(stored.s3_bucket, stored.s3_key)
    return json.dumps({
        "id": stored.id,
        "name": stored.name,
        "description": stored.description,
        "content_type": stored.content_type,
        "size_bytes": stored.size_bytes,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "url": url,
    })


async def _storage_list(args: dict, user_id: str, session: AsyncSession) -> str:
    from src.tools.models import StoredFile

    limit = min(max(int(args.get("limit", 50)), 1), 100)
    offset = max(int(args.get("offset", 0)), 0)

    result = await session.execute(
        select(StoredFile)
        .where(StoredFile.user_id == user_id)
        .order_by(StoredFile.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    files = list(result.scalars().all())

    if not files:
        return "No stored files found."

    parts = []
    for f in files:
        date_str = f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else ""
        parts.append(f"- {f.name} (id: {f.id}, {f.size_bytes} bytes, {date_str})")
    return "\n".join(parts)


async def _storage_search(args: dict, user_id: str, session: AsyncSession) -> str:
    from src.tools.models import StoredFile

    query = args.get("query", "").strip()
    if not query:
        return "Error: query is required."

    result = await session.execute(
        select(StoredFile)
        .where(StoredFile.user_id == user_id)
        .where(StoredFile.name.ilike(f"%{query}%"))
        .order_by(StoredFile.created_at.desc())
        .limit(20)
    )
    files = list(result.scalars().all())

    if not files:
        return f"No files matching '{query}'."

    parts = []
    for f in files:
        parts.append(f"- {f.name} (id: {f.id}, {f.size_bytes} bytes)")
    return "\n".join(parts)


async def _storage_update(args: dict, session: AsyncSession) -> str:
    from src.tools.models import StoredFile

    file_id = args.get("file_id", "").strip()
    if not file_id:
        return "Error: file_id is required."

    result = await session.execute(select(StoredFile).where(StoredFile.id == file_id))
    stored = result.scalar_one_or_none()
    if not stored:
        return f"Error: file '{file_id}' not found."

    new_name = args.get("name")
    new_desc = args.get("description")

    if new_name:
        stored.name = new_name
    if new_desc is not None:
        stored.description = new_desc

    await session.commit()
    return f"File '{stored.name}' updated successfully."


async def _storage_delete(
    args: dict, session: AsyncSession, object_store: Any,
) -> str:
    from src.tools.models import StoredFile

    file_id = args.get("file_id", "").strip()
    if not file_id:
        return "Error: file_id is required."

    result = await session.execute(select(StoredFile).where(StoredFile.id == file_id))
    stored = result.scalar_one_or_none()
    if not stored:
        return f"Error: file '{file_id}' not found."

    await object_store.delete(stored.s3_bucket, stored.s3_key)
    await session.delete(stored)
    await session.commit()
    return f"File '{stored.name}' deleted."
