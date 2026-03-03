"""Embedding provider resolver — resolves per-pipeline embedding configuration.

Centralises fallback logic so every call site uses a single helper
instead of manually reading settings + calling the factory.
"""

from __future__ import annotations

from src.embedding.base import EmbeddingProvider
from src.infra.config import get_settings


def get_memory_embedding_provider() -> EmbeddingProvider:
    """Get the embedding provider for the memory pipeline.

    Used by: fact embedder, memory search, conversation indexer/search,
    supervisor routing, prompt-layer memory context.
    """
    from src.embedding import get_embedding_provider

    settings = get_settings()
    provider = settings.MEMORY_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
    model = settings.MEMORY_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
    return get_embedding_provider(provider, model=model, base_url=settings.OLLAMA_BASE_URL)


def get_knowledge_embedding_provider() -> EmbeddingProvider:
    """Get the embedding provider for the knowledge / RAG pipeline.

    Used by: RAG processor (chunk embedding), RAG search, recall tests,
    prompt-layer RAG context.
    """
    from src.embedding import get_embedding_provider

    settings = get_settings()
    provider = settings.KNOWLEDGE_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
    model = settings.KNOWLEDGE_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
    return get_embedding_provider(provider, model=model, base_url=settings.OLLAMA_BASE_URL)
