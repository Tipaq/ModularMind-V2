"""Embedding module - Text embedding providers."""

from typing import Any

from .base import EmbeddingProvider
from .ollama import OllamaEmbeddingProvider
from .openai import OpenAIEmbeddingProvider

_PROVIDERS: dict[str, type[EmbeddingProvider]] = {
    "ollama": OllamaEmbeddingProvider,
    "openai": OpenAIEmbeddingProvider,
}

_cache: dict[tuple[str, str], EmbeddingProvider] = {}


def get_embedding_provider(provider_name: str, **kwargs: Any) -> EmbeddingProvider:
    """Factory function to get an embedding provider (cached by provider+model)."""
    model = kwargs.get("model", "")
    cache_key = (provider_name, model)

    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    provider_class = _PROVIDERS.get(provider_name)
    if not provider_class:
        available = ", ".join(_PROVIDERS.keys())
        raise ValueError(f"Unknown provider: {provider_name}. Available: {available}")

    instance = provider_class(**kwargs)
    _cache[cache_key] = instance
    return instance


async def shutdown_embedding_providers() -> None:
    """Close all cached embedding provider clients."""
    for provider in _cache.values():
        await provider.close()
    _cache.clear()


__all__ = [
    "EmbeddingProvider",
    "OllamaEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "get_embedding_provider",
    "shutdown_embedding_providers",
]
