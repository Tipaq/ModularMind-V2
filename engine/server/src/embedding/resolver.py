"""Embedding provider resolver — resolves per-pipeline embedding configuration.

Centralises fallback logic so every call site uses a single helper
instead of manually reading settings + calling the factory.
"""

from __future__ import annotations

from src.embedding.base import EmbeddingProvider
from src.infra.config import get_settings

# Providers that need an API key from secrets_store
_CLOUD_PROVIDERS = {"openai", "cohere", "google", "mistral"}

# Secrets-store key name per provider
_PROVIDER_KEY_MAP = {
    "openai": "OPENAI_API_KEY",
    "cohere": "COHERE_API_KEY",
    "google": "GOOGLE_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


def _resolve_kwargs(provider: str) -> dict:
    """Build provider-specific kwargs (api_key, base_url, etc.)."""
    settings = get_settings()

    if provider in _CLOUD_PROVIDERS:
        from src.infra.secrets import secrets_store

        env_key = _PROVIDER_KEY_MAP.get(provider, "")
        return {"api_key": secrets_store.get(env_key, "") or ""}

    # Local providers (ollama, etc.)
    return {"base_url": settings.OLLAMA_BASE_URL}


def get_memory_embedding_provider() -> EmbeddingProvider:
    """Get the embedding provider for the memory pipeline.

    Used by: fact embedder, memory search, conversation indexer/search,
    supervisor routing, prompt-layer memory context.
    """
    from src.embedding import get_embedding_provider

    settings = get_settings()
    provider = settings.MEMORY_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
    model = settings.MEMORY_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
    kwargs = _resolve_kwargs(provider)
    return get_embedding_provider(provider, model=model, **kwargs)


def get_knowledge_embedding_provider() -> EmbeddingProvider:
    """Get the embedding provider for the knowledge / RAG pipeline.

    Used by: RAG processor (chunk embedding), RAG search, recall tests,
    prompt-layer RAG context.
    """
    from src.embedding import get_embedding_provider

    settings = get_settings()
    provider = settings.KNOWLEDGE_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
    model = settings.KNOWLEDGE_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
    kwargs = _resolve_kwargs(provider)
    return get_embedding_provider(provider, model=model, **kwargs)
