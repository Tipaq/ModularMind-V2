"""
Embedding Provider Base Class.

Defines the interface for text embedding providers.
"""

from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable


@runtime_checkable
class IEmbeddingProvider(Protocol):
    """Lightweight protocol for embedding consumers (memory, RAG, etc.).

    Use this when you only need ``embed_text`` + ``dimension`` and want to
    accept *any* provider that satisfies the duck-typed contract.
    """

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for text."""
        ...

    @property
    def dimension(self) -> int:
        """Embedding dimension."""
        ...


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers.

    All embedding providers must implement this interface
    to be usable with the ModularMind memory and RAG systems.
    """

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Get the embedding dimension.

        Returns:
            Dimension of embedding vectors (e.g., 768 for nomic-embed-text)
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get the provider name (e.g., 'ollama', 'openai')."""
        ...

    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        ...

    @abstractmethod
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is available.

        Returns:
            True if the provider is accessible
        """
        ...

    async def close(self) -> None:  # noqa: B027
        """Release any held resources (HTTP clients, etc.)."""
