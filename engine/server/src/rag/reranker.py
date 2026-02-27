"""
Configurable reranking module for RAG search results.

Provides multiple reranker implementations:
- NoopReranker: Pass-through (default)
- CohereReranker: Cohere Rerank API
- CrossEncoderReranker: Local cross-encoder via sentence-transformers
- RerankerFactory: Factory for instantiating by config
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.infra.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class RerankResult:
    """A single reranked result."""

    index: int  # Original index in the input list
    score: float  # Reranker relevance score
    document: str  # Original document text


class BaseReranker(ABC):
    """Abstract base class for rerankers."""

    @abstractmethod
    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_k: int = 5,
    ) -> list[RerankResult]:
        """Rerank documents by relevance to query."""
        ...


class NoopReranker(BaseReranker):
    """Pass-through reranker — returns documents in original order."""

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_k: int = 5,
    ) -> list[RerankResult]:
        return [
            RerankResult(index=i, score=1.0 - (i * 0.01), document=doc)
            for i, doc in enumerate(documents[:top_k])
        ]


class CohereReranker(BaseReranker):
    """Cohere Rerank API reranker."""

    def __init__(self, api_key: str, model: str = "rerank-v3.5") -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            import cohere
            self._client = cohere.AsyncClientV2(api_key=self._api_key)
        return self._client

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_k: int = 5,
    ) -> list[RerankResult]:
        if not documents:
            return []

        client = self._get_client()
        response = await client.rerank(
            query=query,
            documents=documents,
            model=self._model,
            top_n=top_k,
        )

        return [
            RerankResult(
                index=result.index,
                score=result.relevance_score,
                document=documents[result.index],
            )
            for result in response.results
        ]


class CrossEncoderReranker(BaseReranker):
    """Local cross-encoder reranker using sentence-transformers."""

    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
    ) -> None:
        self._model_name = model_name
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import CrossEncoder
            except ImportError:
                raise RuntimeError(
                    "Install sentence-transformers for cross-encoder reranking: "
                    "pip install sentence-transformers"
                )
            self._model = CrossEncoder(self._model_name)
        return self._model

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_k: int = 5,
    ) -> list[RerankResult]:
        if not documents:
            return []

        import asyncio

        model = self._get_model()
        pairs = [(query, doc) for doc in documents]

        # Run in thread pool to avoid blocking async loop
        scores = await asyncio.to_thread(model.predict, pairs)

        # Sort by score descending
        indexed_scores = sorted(
            enumerate(scores), key=lambda x: x[1], reverse=True
        )

        return [
            RerankResult(
                index=idx,
                score=float(score),
                document=documents[idx],
            )
            for idx, score in indexed_scores[:top_k]
        ]


class RerankerFactory:
    """Factory for creating reranker instances from settings."""

    @staticmethod
    def get_reranker(settings: Settings) -> BaseReranker:
        """Return a reranker based on RERANK_PROVIDER setting."""
        provider = settings.RERANK_PROVIDER.lower()

        if provider == "none" or not provider:
            return NoopReranker()
        elif provider == "cohere":
            api_key = settings.COHERE_API_KEY
            if not api_key:
                logger.warning("COHERE_API_KEY not set, falling back to NoopReranker")
                return NoopReranker()
            return CohereReranker(
                api_key=api_key,
                model=settings.RERANK_MODEL or "rerank-v3.5",
            )
        elif provider == "cross-encoder":
            return CrossEncoderReranker(
                model_name=settings.RERANK_MODEL or "cross-encoder/ms-marco-MiniLM-L-6-v2",
            )
        else:
            logger.warning("Unknown RERANK_PROVIDER '%s', using NoopReranker", provider)
            return NoopReranker()
