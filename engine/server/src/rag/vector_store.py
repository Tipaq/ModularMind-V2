"""
Qdrant-backed vector store for RAG knowledge chunks.

Handles hybrid search (dense + BM25 sparse) with RRF fusion,
upsert, and deletion by document or collection.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from qdrant_client import models

from src.infra.qdrant import (
    qdrant_errors_total,
    qdrant_search_duration,
    qdrant_upsert_duration,
)
from src.infra.tokenizer import tokenize_bm25
from src.infra.vector_store import BaseHybridVectorStore

if TYPE_CHECKING:
    from src.rag.reranker import BaseReranker

logger = logging.getLogger(__name__)

MAX_SEARCH_LIMIT = 100


@dataclass
class ChunkData:
    """Data transfer object for a chunk to upsert into Qdrant."""

    id: str  # UUID
    content: str
    embedding: list[float]  # 768-dim dense
    scope: str  # GLOBAL | GROUP | AGENT
    group_slugs: list[str]
    agent_id: str | None
    user_id: str | None
    document_id: str
    collection_id: str
    chunk_index: int
    parent_chunk_id: str | None = None
    chunk_level: int = 0  # 0=parent/standalone, 1=child
    metadata: dict = field(default_factory=dict)


@dataclass
class RAGSearchResult:
    """A single search result from the Qdrant knowledge collection."""

    chunk_id: str
    content: str
    score: float
    scope: str
    document_id: str
    collection_id: str
    chunk_index: int
    metadata: dict = field(default_factory=dict)


class QdrantRAGVectorStore(BaseHybridVectorStore):
    """Qdrant-backed vector store for RAG knowledge chunks."""

    def __init__(self, collection_name: str = "knowledge") -> None:
        super().__init__(collection_name)

    async def upsert_chunks(self, chunks: list[ChunkData]) -> int:
        """Batch upsert chunks to the knowledge collection."""
        if not chunks:
            return 0

        client = await self._get_client()
        points: list[models.PointStruct] = []
        for chunk in chunks:
            sparse = tokenize_bm25(chunk.content)
            points.append(
                models.PointStruct(
                    id=chunk.id,
                    vector={
                        "dense": chunk.embedding,
                        "sparse": sparse,
                    },
                    payload={
                        "content": chunk.content,
                        "scope": chunk.scope,
                        "group_slugs": chunk.group_slugs,
                        "agent_id": chunk.agent_id,
                        "user_id": chunk.user_id,
                        "document_id": chunk.document_id,
                        "collection_id": chunk.collection_id,
                        "chunk_index": chunk.chunk_index,
                        "parent_chunk_id": chunk.parent_chunk_id,
                        "chunk_level": chunk.chunk_level,
                        "metadata": chunk.metadata,
                    },
                )
            )

        t0 = time.monotonic()
        await client.upsert(
            collection_name=self._collection,
            points=points,
        )
        qdrant_upsert_duration.labels(collection=self._collection).observe(time.monotonic() - t0)
        logger.debug("Upserted %d chunks to %s", len(points), self._collection)
        return len(points)

    async def search(
        self,
        query_embedding: list[float],
        query_text: str,
        filters: models.Filter | None = None,
        limit: int = 10,
        threshold: float = 0.0,
        reranker: BaseReranker | None = None,
    ) -> list[RAGSearchResult]:
        """Hybrid search: dense + BM25 sparse with RRF fusion.

        If a reranker is provided, fetches top-20 candidates from Qdrant
        then reranks down to `limit`.

        Returns empty list (degraded) if Qdrant is unavailable.
        """
        limit = min(limit, MAX_SEARCH_LIMIT)

        # Fetch more candidates when reranking
        fetch_limit = max(20, limit * 3) if reranker else limit

        t0 = time.monotonic()
        hits = await self._hybrid_search(
            query_embedding=query_embedding,
            query_text=query_text,
            filters=filters,
            limit=fetch_limit,
            threshold=threshold,
        )

        if self.last_search_degraded:
            qdrant_errors_total.labels(error_type="search").inc()
            return []

        qdrant_search_duration.labels(collection=self._collection, search_type="hybrid").observe(
            time.monotonic() - t0
        )

        candidates = [
            RAGSearchResult(
                chunk_id=hit.point_id,
                content=hit.payload.get("content", ""),
                score=hit.score,
                scope=hit.payload.get("scope", ""),
                document_id=hit.payload.get("document_id", ""),
                collection_id=hit.payload.get("collection_id", ""),
                chunk_index=hit.payload.get("chunk_index", 0),
                metadata=hit.payload.get("metadata", {}),
            )
            for hit in hits
        ]

        if reranker and candidates:
            try:
                reranked = await reranker.rerank(
                    query=query_text,
                    documents=[c.content for c in candidates],
                    top_k=limit,
                )
                candidates = [
                    RAGSearchResult(
                        chunk_id=candidates[rr.index].chunk_id,
                        content=candidates[rr.index].content,
                        score=rr.score,
                        scope=candidates[rr.index].scope,
                        document_id=candidates[rr.index].document_id,
                        collection_id=candidates[rr.index].collection_id,
                        chunk_index=candidates[rr.index].chunk_index,
                        metadata={
                            **candidates[rr.index].metadata,
                            "qdrant_score": candidates[rr.index].score,
                        },
                    )
                    for rr in reranked
                ]
            except Exception:  # Graceful degradation: reranker falls back to Qdrant scores
                logger.warning("Reranking failed, using Qdrant scores", exc_info=True)
                candidates = candidates[:limit]
        else:
            candidates = candidates[:limit]

        return candidates

    async def delete_by_document(self, document_id: str) -> bool:
        """Delete all points matching a document_id."""
        return await self._delete_by_filter(
            [
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                )
            ]
        )

    async def delete_by_collection(self, collection_id: str) -> bool:
        """Delete all points matching a collection_id."""
        return await self._delete_by_filter(
            [
                models.FieldCondition(
                    key="collection_id",
                    match=models.MatchValue(value=collection_id),
                )
            ]
        )

    async def get_collection_stats(self) -> dict:
        """Return point count and index status."""
        client = await self._get_client()
        info = await client.get_collection(self._collection)
        return {
            "points_count": info.points_count,
            "indexed_vectors_count": info.indexed_vectors_count,
            "status": info.status.value if info.status else "unknown",
        }
