"""
Base hybrid vector store.

Shared Qdrant hybrid search (dense + BM25 sparse + RRF fusion) logic
used by both memory and RAG vector stores.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from qdrant_client import models

from src.infra.qdrant import qdrant_factory
from src.infra.tokenizer import tokenize_bm25

logger = logging.getLogger(__name__)


@dataclass
class HybridSearchHit:
    """Raw search hit from Qdrant hybrid search."""

    point_id: str
    score: float
    payload: dict[str, Any]


class BaseHybridVectorStore:
    """Base class for Qdrant-backed hybrid search stores.

    Provides shared logic for dense + BM25 sparse search with RRF fusion.
    Subclasses should set `_collection` and implement domain-specific methods.
    """

    _collection: str
    last_search_degraded: bool

    def __init__(self, collection_name: str) -> None:
        self._collection = collection_name
        self.last_search_degraded = False

    async def _get_client(self):
        """Get the shared Qdrant async client."""
        return await qdrant_factory.get_client()

    async def _hybrid_search(
        self,
        query_embedding: list[float],
        query_text: str,
        filters: models.Filter | None = None,
        limit: int = 10,
        threshold: float = 0.0,
    ) -> list[HybridSearchHit]:
        """Execute hybrid search (dense + BM25 sparse) with RRF fusion.

        Returns raw hits. Subclasses convert these to domain-specific results.
        Returns empty list on Qdrant failure (graceful degradation).
        """
        self.last_search_degraded = False
        try:
            client = await self._get_client()
        except Exception:
            logger.error("Qdrant unavailable for %s search", self._collection, exc_info=True)
            self.last_search_degraded = True
            return []

        prefetch = [
            models.Prefetch(query=query_embedding, using="dense", limit=50),
        ]
        if query_text.strip():
            sparse = tokenize_bm25(query_text)
            if sparse.indices:
                prefetch.append(
                    models.Prefetch(query=sparse, using="sparse", limit=50),
                )

        try:
            results = await client.query_points(
                collection_name=self._collection,
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                query_filter=filters,
                limit=limit,
                with_payload=True,
                score_threshold=threshold if threshold > 0 else None,
            )
        except Exception:
            logger.error("Qdrant %s search failed", self._collection, exc_info=True)
            self.last_search_degraded = True
            return []

        return [
            HybridSearchHit(
                point_id=str(point.id),
                score=point.score,
                payload=point.payload or {},
            )
            for point in results.points
        ]

    async def _delete_by_filter(self, filter_conditions: list[models.Condition]) -> bool:
        """Delete points matching filter conditions. Returns True on success."""
        from qdrant_client.models import UpdateStatus

        client = await self._get_client()
        result = await client.delete(
            collection_name=self._collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(must=filter_conditions)
            ),
        )
        return result.status == UpdateStatus.COMPLETED
