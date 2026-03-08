"""
Cross-conversation search service.

Uses PG tsvector full-text search (GIN-indexed) for conversation message search.
Replaces the previous Qdrant-based implementation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.conversations.models import Conversation, ConversationMessage

logger = logging.getLogger(__name__)


@dataclass
class ConversationSearchResult:
    """A single cross-conversation search result."""

    conversation_id: str
    conversation_title: str | None
    message_content: str
    score: float
    timestamp: str | None
    agent_id: str | None


class ConversationSearchService:
    """PG tsvector-based conversation search."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def search(
        self,
        query: str,
        user_id: str,
        agent_id: str | None = None,
        limit: int = 10,
        **_kwargs,
    ) -> list[ConversationSearchResult]:
        """Search conversation messages using PG tsvector.

        Uses the 'simple' dictionary for multilingual support.
        """
        if not query.strip():
            return []

        tsquery = func.plainto_tsquery("simple", query)

        stmt = (
            select(
                ConversationMessage.conversation_id,
                Conversation.title,
                ConversationMessage.content,
                func.ts_rank(ConversationMessage.search_vector, tsquery).label("rank"),
                ConversationMessage.created_at,
                Conversation.agent_id,
            )
            .join(Conversation, ConversationMessage.conversation_id == Conversation.id)
            .where(
                ConversationMessage.search_vector.op("@@")(tsquery),
                Conversation.user_id == user_id,
            )
        )

        if agent_id:
            stmt = stmt.where(Conversation.agent_id == agent_id)

        stmt = stmt.order_by(func.ts_rank(ConversationMessage.search_vector, tsquery).desc()).limit(
            limit
        )

        result = await self._db.execute(stmt)

        return [
            ConversationSearchResult(
                conversation_id=row.conversation_id,
                conversation_title=row.title,
                message_content=row.content or "",
                score=float(row.rank),
                timestamp=row.created_at.isoformat() if row.created_at else None,
                agent_id=row.agent_id,
            )
            for row in result.all()
        ]
