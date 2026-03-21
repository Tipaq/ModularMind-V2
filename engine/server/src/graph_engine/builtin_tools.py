"""Built-in tools for the graph engine.

Provides conversation search, recent conversations, and user profile update
tools that are injected into agent graphs alongside MCP tools. These tools
operate on the engine's own database (not via MCP).
"""

import json
import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Set of known built-in tool names for routing in UnifiedToolExecutor
BUILTIN_TOOL_NAMES = {"conversation_search", "recent_conversations", "update_user_profile"}


def get_builtin_tool_definitions() -> list[dict]:
    """Return OpenAI-compatible function definitions for built-in tools.

    Same format as MCP tools from ``discover_and_convert``.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "conversation_search",
                "description": (
                    "Search through the user's past conversation messages using "
                    "full-text search. Use this to recall what was discussed before."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query to find in past conversations.",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-10, default 5).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "recent_conversations",
                "description": (
                    "List the user's most recent conversations with titles and previews. "
                    "Use this to see what topics were recently discussed."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "n": {
                            "type": "integer",
                            "description": "Number of recent conversations to return (1-20, default 3).",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_user_profile",
                "description": (
                    "Update the user's profile preferences. The profile is shown to "
                    "the assistant at the start of every conversation. Use this to "
                    "remember user preferences, facts, or instructions across conversations. "
                    "This is a full replacement — include ALL existing preferences plus changes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "preferences": {
                            "type": "string",
                            "description": "The full user profile text (max 2000 characters).",
                        },
                    },
                    "required": ["preferences"],
                },
            },
        },
    ]


def create_builtin_executor(user_id: str, session_maker: Callable) -> Callable[..., Any]:
    """Create a built-in tool executor closure for a specific user.

    Each tool call creates a fresh DB session via ``session_maker`` for
    correct async session lifecycle.
    """

    async def execute(tool_name: str, tool_args: dict) -> str:
        async with session_maker() as session:
            if tool_name == "conversation_search":
                return await _handle_conversation_search(tool_args, user_id, session)
            elif tool_name == "recent_conversations":
                return await _handle_recent_conversations(tool_args, user_id, session)
            elif tool_name == "update_user_profile":
                return await _handle_update_user_profile(tool_args, user_id, session)
            raise ValueError(f"Unknown built-in tool: {tool_name}")

    return execute


class UnifiedToolExecutor:
    """Dispatches tool calls to built-in, Gateway, or MCP executors.

    Matches ``MCPToolExecutor.execute(name, args) -> str`` interface
    via duck typing (no shared base class needed).
    """

    def __init__(
        self,
        builtin_fn: Callable[..., Any],
        mcp_executor: Any | None,
        builtin_names: set[str],
        gateway_executor: Any | None = None,
        extended_executor: Any | None = None,
    ):
        self._builtin = builtin_fn
        self._mcp = mcp_executor
        self._names = builtin_names
        self._gateway = gateway_executor
        self._extended = extended_executor

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        if name in self._names:
            return await self._builtin(name, args)
        if name.startswith("gateway__") and self._gateway:
            return await self._gateway.execute(name, args)
        if self._extended and self._extended.handles(name):
            return await self._extended.execute(name, args)
        if self._mcp:
            return await self._mcp.execute(name, args)
        raise ValueError(f"Unknown tool: {name}")


# ---------------------------------------------------------------------------
# Tool handler implementations
# ---------------------------------------------------------------------------


async def _handle_conversation_search(args: dict, user_id: str, session: AsyncSession) -> str:
    """Search past conversation messages via PG full-text search."""
    from src.conversations.models import Conversation, ConversationMessage

    query = args.get("query", "").strip()
    if not query:
        return "Error: query parameter is required."

    max_results = min(max(int(args.get("max_results", 5)), 1), 10)

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
        .limit(max_results)
    )
    rows = results.all()

    if not rows:
        return "No results found."

    parts = []
    for content, role, created_at, title in rows:
        role_str = role.value if hasattr(role, "value") else str(role)
        date_str = created_at.strftime("%Y-%m-%d %H:%M") if created_at else "unknown"
        conv_title = title or "Untitled"
        parts.append(f"Conversation: {conv_title} ({date_str})\n{role_str}: {content}")

    return "\n---\n".join(parts)


async def _handle_recent_conversations(args: dict, user_id: str, session: AsyncSession) -> str:
    """List recent conversations with title and last message preview."""
    from src.conversations.models import Conversation, ConversationMessage

    n = min(max(int(args.get("n", 3)), 1), 20)

    # Get N most recent conversations
    convs = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
        .limit(n)
    )
    conversations = list(convs.scalars().all())

    if not conversations:
        return "No recent conversations found."

    parts = []
    for conv in conversations:
        date_str = conv.updated_at.strftime("%Y-%m-%d %H:%M") if conv.updated_at else "unknown"
        title = conv.title or "Untitled"

        # Get last message preview
        last_msg = await session.execute(
            select(ConversationMessage.content)
            .where(ConversationMessage.conversation_id == conv.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(1)
        )
        preview = last_msg.scalar_one_or_none() or ""
        if len(preview) > 200:
            preview = preview[:200] + "..."

        parts.append(f"- {title} ({date_str}): {preview}")

    return "\n".join(parts)


async def _handle_update_user_profile(args: dict, user_id: str, session: AsyncSession) -> str:
    """Update user preferences (full replace)."""
    from src.auth.models import User

    preferences = args.get("preferences", "")
    if not isinstance(preferences, str):
        preferences = json.dumps(preferences)

    if len(preferences) > 2000:
        return "Error: preferences must be at most 2000 characters."

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return "Error: user not found."

    user.preferences = preferences
    await session.commit()
    return "User profile updated successfully."
