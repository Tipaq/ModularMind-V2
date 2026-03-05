"""Embedding module - Text embedding providers."""

from typing import Any

from .base import EmbeddingProvider
from .ollama import OllamaEmbeddingProvider
from .openai import OpenAIEmbeddingProvider

# Registry of available providers
_PROVIDERS: dict[str, type[EmbeddingProvider]] = {
    "ollama": OllamaEmbeddingProvider,
    "openai": OpenAIEmbeddingProvider,
}


def get_embedding_provider(provider_name: str, **kwargs: Any) -> EmbeddingProvider:
    """Factory function to get an embedding provider.

    Args:
        provider_name: Type of provider ("ollama")
        **kwargs: Provider-specific configuration

    Returns:
        An embedding provider instance

    Raises:
        ValueError: If provider_name is not recognized

    Example:
        >>> provider = get_embedding_provider("ollama", model="nomic-embed-text")
        >>> embedding = await provider.embed_text("Hello world")
    """
    provider_class = _PROVIDERS.get(provider_name)
    if not provider_class:
        available = ", ".join(_PROVIDERS.keys())
        raise ValueError(f"Unknown provider: {provider_name}. Available: {available}")

    return provider_class(**kwargs)



__all__ = [
    "EmbeddingProvider",
    "OllamaEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "get_embedding_provider",
]
