"""
Shared constants for the agent runtime.

Centralised magic numbers and defaults used across multiple modules.
Import from here instead of hard-coding values in business logic.
"""

# Known LLM providers — used to parse "provider:model" IDs correctly.
# Without this, Ollama tags like "llama3.2:latest" get incorrectly split.
KNOWN_PROVIDERS: frozenset[str] = frozenset({
    "ollama", "openai", "anthropic", "google", "mistral", "cohere",
})


def parse_model_id(model_id: str) -> tuple[str, str]:
    """Parse 'provider:model' into (provider_name, model_name).

    Handles Ollama tags like 'qwen3:8b' or 'llama3.2:latest' correctly
    by checking if the prefix is a known provider name.  If not, the
    entire string is treated as an Ollama model identifier.
    """
    if ":" in model_id:
        prefix, rest = model_id.split(":", 1)
        if prefix.lower() in KNOWN_PROVIDERS:
            return prefix.lower(), rest
    return "ollama", model_id

# ── Embeddings ────────────────────────────────────────────────────────────────
EMBEDDING_DIMENSION: int = 768
"""Default dense-vector dimension (nomic-embed-text)."""

EMBEDDING_ZERO_VECTOR: list[float] = [0.0] * EMBEDDING_DIMENSION
"""Pre-built zero vector for fallback / padding."""

# ── Output & Display ──────────────────────────────────────────────────────────
OUTPUT_TRUNCATION_LENGTH: int = 500
"""Max characters kept when truncating LLM/node output for storage."""

# ── Timeouts (seconds) ────────────────────────────────────────────────────────
GRAPH_COMPILATION_TIMEOUT: int = 30
"""asyncio.wait_for timeout when compiling a graph."""

MODEL_PULL_TIMEOUT: float = 600.0
"""httpx timeout for pulling Ollama / embedding models."""

CONFIG_LOCK_TIMEOUT: int = 30
"""Redis distributed-lock timeout for agent config writes."""

# ── Rate Limits (requests/min) ────────────────────────────────────────────────
RATE_LIMIT_LOGIN: int = 5
RATE_LIMIT_PASSWORD: int = 3
RATE_LIMIT_REFRESH: int = 10
RATE_LIMIT_WEBHOOK: int = 30
RATE_LIMIT_INTERNAL: int = 6

# ── Concurrency ───────────────────────────────────────────────────────────────
DISCORD_MAX_CONCURRENT: int = 10
"""Max concurrent Discord agent background tasks."""
