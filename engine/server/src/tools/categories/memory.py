"""Memory tools — read-only access to conversation history and RAG context.

Since ModularMind uses RAG (not persistent memory graphs), these tools
provide agents with explicit search capabilities over conversation data.
Automatic memory extraction remains the primary write mechanism.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


def get_memory_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for memory category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "memory_recall",
                "description": (
                    "Search your memory of past conversations with this user. "
                    "Uses full-text search to find relevant messages, facts, and context "
                    "from previous interactions. Use this when you need to remember "
                    "what was discussed before."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query to find in past conversations.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results to return (1-20, default 5).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "memory_list",
                "description": (
                    "List recent conversations with this user, showing titles, dates, "
                    "and message previews. Use this to see what topics were recently discussed."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of recent conversations (1-50, default 10).",
                        },
                    },
                    "required": [],
                },
            },
        },
    ]


async def execute_memory_tool(
    name: str,
    args: dict[str, Any],
    user_id: str,
    session: AsyncSession,
) -> str:
    """Execute a memory tool."""
    if name == "memory_recall":
        return await _memory_recall(args, user_id, session)
    if name == "memory_list":
        return await _memory_list(args, user_id, session)
    return f"Error: unknown memory tool '{name}'"


async def _memory_recall(args: dict, user_id: str, session: AsyncSession) -> str:
    """Full-text search across past conversation messages."""
    from src.conversations.models import Conversation, ConversationMessage

    query = args.get("query", "").strip()
    if not query:
        return "Error: query parameter is required."

    limit = min(max(int(args.get("limit", 5)), 1), 20)

    tsquery = func.plainto_tsquery("simple", query)
    results = await session.execute(
        select(
            ConversationMessage.content,
            ConversationMessage.role,
            ConversationMessage.created_at,
            Conversation.title,
        )
        .join(Conversation, ConversationMessage.conversation_id == Conversation.id)
        .where(ConversationMessage.search_vector.op("@@")(tsquery))
        .where(Conversation.user_id == user_id)
        .order_by(func.ts_rank(ConversationMessage.search_vector, tsquery).desc())
        .limit(limit)
    )
    rows = results.all()

    if not rows:
        return "No memories found matching your query."

    parts = []
    for content, role, created_at, title in rows:
        role_str = role.value if hasattr(role, "value") else str(role)
        date_str = created_at.strftime("%Y-%m-%d %H:%M") if created_at else "unknown"
        conv_title = title or "Untitled"
        parts.append(f"[{conv_title} — {date_str}] {role_str}: {content}")

    return "\n---\n".join(parts)


async def _memory_list(args: dict, user_id: str, session: AsyncSession) -> str:
    """List recent conversations with previews."""
    from src.conversations.models import Conversation, ConversationMessage

    limit = min(max(int(args.get("limit", 10)), 1), 50)

    convs = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
        .limit(limit)
    )
    conversations = list(convs.scalars().all())

    if not conversations:
        return "No conversations found."

    parts = []
    for conv in conversations:
        date_str = conv.updated_at.strftime("%Y-%m-%d %H:%M") if conv.updated_at else "unknown"
        title = conv.title or "Untitled"

        last_msg = await session.execute(
            select(ConversationMessage.content)
            .where(ConversationMessage.conversation_id == conv.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(1)
        )
        preview = last_msg.scalar_one_or_none() or ""
        if len(preview) > 150:
            preview = preview[:150] + "..."

        parts.append(f"- {title} ({date_str}): {preview}")

    return "\n".join(parts)
