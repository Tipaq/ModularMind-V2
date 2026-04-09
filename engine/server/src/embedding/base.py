"""Embedding Provider Protocol.

Defines the interface for text embedding providers.
"""

from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Protocol for embedding providers.

    All embedding providers must implement this interface
    to be usable with the ModularMind memory and RAG systems.
    """

    @property
    def dimension(self) -> int:
        """Get the embedding dimension."""
        ...

    @property
    def provider_name(self) -> str:
        """Get the provider name (e.g., 'ollama', 'openai')."""
        ...

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        ...

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        ...

    async def is_available(self) -> bool:
        """Check if the provider is available."""
        ...

    async def close(self) -> None:
        """Release any held resources (HTTP clients, etc.)."""
        ...
