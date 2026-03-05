"""
RAG Retriever.

Retrieves relevant context from RAG collections for agent prompts.
Uses Qdrant hybrid search (dense + BM25 sparse) with double-gate ACL.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.embedding.base import IEmbeddingProvider

if TYPE_CHECKING:
    from src.rag.repository import RAGSearchResult

logger = logging.getLogger(__name__)


class RAGRetriever:
    """Retrieves relevant context from RAG collections.

    Handles embedding queries and searching across collections
    to find relevant document chunks for agent context.
    """

    def __init__(
        self,
        repository: Any,
        embedding_provider: IEmbeddingProvider,
        default_limit: int = 5,
        default_threshold: float = 0.0,
    ):
        self.repository = repository
        self.embedding_provider = embedding_provider
        self.default_limit = default_limit
        self.default_threshold = default_threshold

    async def retrieve(
        self,
        query: str,
        user_id: str = "",
        user_groups: list[str] | None = None,
        collection_ids: list[str] | None = None,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> str:
        """Retrieve relevant context for a query.

        Returns formatted context string for inclusion in prompt.
        """
        limit = limit or self.default_limit
        threshold = (
            threshold if threshold is not None else self.default_threshold
        )

        try:
            query_embedding = await self.embedding_provider.embed_text(
                query,
            )

            # Ensure collection IDs are strings (callers may pass UUIDs)
            str_ids = (
                [str(c) for c in collection_ids]
                if collection_ids
                else None
            )

            results = await self.repository.search_hybrid(
                query_embedding=query_embedding,
                query_text=query,
                user_id=user_id,
                user_groups=user_groups or [],
                collection_ids=str_ids,
                limit=limit,
                threshold=threshold,
            )

            if not results:
                logger.debug("No RAG results found for query")
                return ""

            logger.info("Found %d RAG results for query", len(results))
            return self.format_context(results)

        except Exception as e:
            logger.error("Error retrieving RAG context: %s", e)
            return ""

    async def retrieve_raw(
        self,
        query: str,
        user_id: str = "",
        user_groups: list[str] | None = None,
        collection_ids: list[str] | None = None,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> list[RAGSearchResult]:
        """Retrieve raw search results without formatting."""
        limit = limit or self.default_limit
        threshold = (
            threshold if threshold is not None else self.default_threshold
        )

        try:
            query_embedding = await self.embedding_provider.embed_text(
                query,
            )

            str_ids = (
                [str(c) for c in collection_ids]
                if collection_ids
                else None
            )

            return await self.repository.search_hybrid(
                query_embedding=query_embedding,
                query_text=query,
                user_id=user_id,
                user_groups=user_groups or [],
                collection_ids=str_ids,
                limit=limit,
                threshold=threshold,
            )

        except Exception as e:
            logger.error("Error retrieving RAG results: %s", e)
            return []

    def format_context(
        self,
        results: list[RAGSearchResult],
        include_scores: bool = False,
        max_chars_per_chunk: int | None = None,
        max_total_chars: int | None = None,
    ) -> str:
        """Format search results into context string."""
        if not results:
            return ""

        header = "### Relevant Context from Documents\n"
        lines = [header]
        total_chars = len(header)

        for i, result in enumerate(results, 1):
            content = result.content

            if max_chars_per_chunk and len(content) > max_chars_per_chunk:
                content = content[:max_chars_per_chunk] + "..."

            header_parts = [f"**Source {i}**"]
            if result.document:
                header_parts.append(f"({result.document.filename})")
            if include_scores:
                header_parts.append(f"[score: {result.score:.3f}]")

            entry = " ".join(header_parts) + ":\n" + content + "\n"
            if max_total_chars and total_chars + len(entry) > max_total_chars:
                break
            lines.append(entry)
            total_chars += len(entry)

        return "\n".join(lines)

    async def check_collections_available(
        self,
        collection_ids: list[str],
    ) -> dict[str, bool]:
        """Check which collections are available (batch query)."""
        if not collection_ids:
            return {}
        existing = await self.repository.get_collections_by_ids(
            collection_ids,
        )
        existing_ids = {c.id for c in existing}
        return {cid: cid in existing_ids for cid in collection_ids}
