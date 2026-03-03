"""
Cross-conversation search service.

Searches the Qdrant memory collection for conversation-scoped entries
(both per-message and summary) to enable cross-conversation search.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from qdrant_client import models

from src.embedding.resolver import get_memory_embedding_provider
from src.infra.qdrant import qdrant_factory
from src.infra.tokenizer import tokenize_bm25

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
    """DB-agnostic service — only talks to Qdrant."""

    def __init__(self, collection_name: str = "memory") -> None:
        self._collection = collection_name

    async def search(
        self,
        query: str,
        user_id: str,
        agent_id: str | None = None,
        group_search: bool = False,
        allowed_group_user_ids: list[str] | None = None,
        limit: int = 10,
        threshold: float = 0.6,
    ) -> list[ConversationSearchResult]:
        """Search cross-conversation content in Qdrant memory collection.

        Filters by scope IN (conversation, cross_conversation) and user_id.
        If group_search, expands to allowed_group_user_ids.
        """
        embedding_provider = get_memory_embedding_provider()
        query_embedding = await embedding_provider.embed_text(query)

        client = await qdrant_factory.get_client()

        # Build filter: scope in (conversation, cross_conversation)
        scope_filter = models.FieldCondition(
            key="scope",
            match=models.MatchAny(any=["conversation", "cross_conversation"]),
        )

        # User filter: own user_id or group members
        if group_search and allowed_group_user_ids:
            all_user_ids = list(set([user_id] + allowed_group_user_ids))
            user_filter = models.FieldCondition(
                key="user_id",
                match=models.MatchAny(any=all_user_ids),
            )
        else:
            user_filter = models.FieldCondition(
                key="user_id",
                match=models.MatchValue(value=user_id),
            )

        must_conditions: list[models.Condition] = [scope_filter, user_filter]

        if agent_id:
            must_conditions.append(
                models.FieldCondition(
                    key="metadata.agent_id",
                    match=models.MatchValue(value=agent_id),
                )
            )

        filters = models.Filter(must=must_conditions)

        # Hybrid prefetch
        prefetch = [
            models.Prefetch(query=query_embedding, using="dense", limit=50),
        ]
        if query.strip():
            sparse = tokenize_bm25(query)
            if sparse.indices:
                prefetch.append(
                    models.Prefetch(query=sparse, using="sparse", limit=50),
                )

        results = await client.query_points(
            collection_name=self._collection,
            prefetch=prefetch,
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            query_filter=filters,
            limit=limit,
            with_payload=True,
            score_threshold=threshold if threshold > 0 else None,
        )

        return [
            ConversationSearchResult(
                conversation_id=point.payload.get("conversation_id", ""),
                conversation_title=point.payload.get("metadata", {}).get(
                    "conversation_title"
                ),
                message_content=point.payload.get("content", ""),
                score=point.score,
                timestamp=point.payload.get("metadata", {}).get("timestamp"),
                agent_id=point.payload.get("metadata", {}).get("agent_id"),
            )
            for point in results.points
        ]
