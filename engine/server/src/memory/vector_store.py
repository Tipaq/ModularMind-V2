"""
Qdrant-backed vector store for memory entries.

Handles hybrid search (dense + BM25 sparse) with RRF fusion,
upsert, and deletion by entry or scope.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from qdrant_client import models

from src.infra.tokenizer import tokenize_bm25
from src.infra.vector_store import BaseHybridVectorStore

logger = logging.getLogger(__name__)


@dataclass
class MemorySearchResult:
    """A single search result from the Qdrant memory collection."""

    point_id: str
    content: str
    scope: str
    user_id: str | None
    conversation_id: str | None
    agent_id: str | None
    importance: float
    metadata: dict
    score: float


class QdrantMemoryVectorStore(BaseHybridVectorStore):
    """Qdrant-backed vector store for memory entries."""

    def __init__(self, collection_name: str = "memory") -> None:
        super().__init__(collection_name)

    async def upsert_entry(
        self,
        entry_id: str,
        embedding: list[float],
        content: str,
        scope: str,
        scope_id: str,
        user_id: str,
        conversation_id: str | None = None,
        importance: float = 0.5,
        metadata: dict | None = None,
    ) -> None:
        """Upsert a single memory point to the memory collection."""
        client = await self._get_client()

        # Decompose scope + scope_id into dedicated payload fields
        agent_id: str | None = None
        conv_id: str | None = conversation_id
        payload_user_id: str = user_id

        if scope == "agent":
            agent_id = scope_id
        elif scope in ("conversation", "cross_conversation"):
            conv_id = scope_id
        elif scope == "user_profile":
            payload_user_id = scope_id

        sparse = tokenize_bm25(content)

        point = models.PointStruct(
            id=entry_id,
            vector={
                "dense": embedding,
                "sparse": sparse,
            },
            payload={
                "content": content,
                "scope": scope,
                "user_id": payload_user_id,
                "agent_id": agent_id,
                "conversation_id": conv_id,
                "importance": importance,
                "metadata": metadata or {},
            },
        )

        await client.upsert(
            collection_name=self._collection,
            points=[point],
        )
        logger.debug("Upserted memory entry %s to %s", entry_id, self._collection)

    async def search(
        self,
        query_embedding: list[float],
        query_text: str,
        user_id: str,
        scope: str | None = None,
        scope_id: str | None = None,
        limit: int = 10,
        threshold: float = 0.0,
    ) -> list[MemorySearchResult]:
        """Hybrid search (dense + BM25 sparse) with user-scoped filtering.

        Returns empty list if Qdrant is unavailable (graceful degradation).
        """
        # Build filter conditions
        must_conditions: list[models.Condition] = [
            models.FieldCondition(
                key="user_id",
                match=models.MatchValue(value=user_id),
            )
        ]

        if scope:
            must_conditions.append(
                models.FieldCondition(
                    key="scope",
                    match=models.MatchValue(value=scope),
                )
            )

        if scope_id:
            if scope == "agent":
                must_conditions.append(
                    models.FieldCondition(
                        key="agent_id",
                        match=models.MatchValue(value=scope_id),
                    )
                )
            elif scope in ("conversation", "cross_conversation"):
                must_conditions.append(
                    models.FieldCondition(
                        key="conversation_id",
                        match=models.MatchValue(value=scope_id),
                    )
                )

        filters = models.Filter(must=must_conditions)

        hits = await self._hybrid_search(
            query_embedding=query_embedding,
            query_text=query_text,
            filters=filters,
            limit=limit,
            threshold=threshold,
        )

        return [
            MemorySearchResult(
                point_id=hit.point_id,
                content=hit.payload.get("content", ""),
                scope=hit.payload.get("scope", ""),
                user_id=hit.payload.get("user_id"),
                conversation_id=hit.payload.get("conversation_id"),
                agent_id=hit.payload.get("agent_id"),
                importance=hit.payload.get("importance", 0.5),
                metadata=hit.payload.get("metadata", {}),
                score=hit.score,
            )
            for hit in hits
        ]

    async def delete_entry(self, entry_id: str) -> None:
        """Delete a single memory point."""
        client = await self._get_client()
        await client.delete(
            collection_name=self._collection,
            points_selector=models.PointIdsList(points=[entry_id]),
        )

    async def delete_by_scope(self, scope: str, scope_id: str) -> bool:
        """Bulk delete by scope. Returns True if Qdrant operation succeeded."""
        # Determine which payload field to filter by
        if scope == "agent":
            field_key = "agent_id"
        elif scope in ("conversation", "cross_conversation"):
            field_key = "conversation_id"
        elif scope == "user_profile":
            field_key = "user_id"
        else:
            field_key = "user_id"

        return await self._delete_by_filter([
            models.FieldCondition(
                key="scope",
                match=models.MatchValue(value=scope),
            ),
            models.FieldCondition(
                key=field_key,
                match=models.MatchValue(value=scope_id),
            ),
        ])

    async def delete_by_user_id(self, user_id: str) -> bool:
        """Delete all memory points for a user. Returns True on success."""
        return await self._delete_by_filter([
            models.FieldCondition(
                key="user_id",
                match=models.MatchValue(value=user_id),
            ),
        ])
