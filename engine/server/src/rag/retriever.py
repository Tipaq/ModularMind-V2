"""
RAG Retriever.

Retrieves relevant context from RAG collections for agent prompts.
Uses Qdrant hybrid search (dense + BM25 sparse) with double-gate ACL.
"""

import logging
from typing import Any
from uuid import UUID

from src.embedding.base import IEmbeddingProvider

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
        collection_ids: list[UUID] | None = None,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> str:
        """Retrieve relevant context for a query.

        Returns formatted context string for inclusion in prompt.
        """
        limit = limit or self.default_limit
        threshold = threshold if threshold is not None else self.default_threshold

        try:
            query_embedding = await self.embedding_provider.embed_text(query)

            str_collection_ids = (
                [str(cid) for cid in collection_ids] if collection_ids else None
            )

            results = await self.repository.search_hybrid(
                query_embedding=query_embedding,
                query_text=query,
                user_id=user_id,
                user_groups=user_groups or [],
                collection_ids=str_collection_ids,
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
        collection_ids: list[UUID] | None = None,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> list:
        """Retrieve raw search results without formatting."""
        limit = limit or self.default_limit
        threshold = threshold if threshold is not None else self.default_threshold

        try:
            query_embedding = await self.embedding_provider.embed_text(query)

            str_collection_ids = (
                [str(cid) for cid in collection_ids] if collection_ids else None
            )

            return await self.repository.search_hybrid(
                query_embedding=query_embedding,
                query_text=query,
                user_id=user_id,
                user_groups=user_groups or [],
                collection_ids=str_collection_ids,
                limit=limit,
                threshold=threshold,
            )

        except Exception as e:
            logger.error("Error retrieving RAG results: %s", e)
            return []

    def format_context(
        self,
        results: list,
        include_scores: bool = False,
        max_chars_per_chunk: int | None = None,
    ) -> str:
        """Format search results into context string."""
        if not results:
            return ""

        lines = ["### Relevant Context from Documents", ""]

        for i, result in enumerate(results, 1):
            content = result.content

            if max_chars_per_chunk and len(content) > max_chars_per_chunk:
                content = content[:max_chars_per_chunk] + "..."

            header_parts = [f"**Source {i}**"]
            if result.document:
                header_parts.append(f"({result.document.filename})")
            if include_scores:
                header_parts.append(f"[score: {result.score:.3f}]")

            lines.append(" ".join(header_parts) + ":")
            lines.append(content)
            lines.append("")

        return "\n".join(lines)

    async def check_collections_available(
        self,
        collection_ids: list[UUID],
    ) -> dict[UUID, bool]:
        """Check which collections are available."""
        available = {}
        for cid in collection_ids:
            collection = await self.repository.get_collection(cid)
            available[cid] = collection is not None
        return available
