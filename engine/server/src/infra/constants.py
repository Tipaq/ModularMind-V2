"""
Shared constants for the agent runtime.

Centralised magic numbers and defaults used across multiple modules.
Import from here instead of hard-coding values in business logic.
"""

# Known LLM providers — used to parse "provider:model" IDs correctly.
# Without this, Ollama tags like "llama3.2:latest" get incorrectly split.
KNOWN_PROVIDERS: frozenset[str] = frozenset(
    {
        "ollama",
        "openai",
        "anthropic",
        "google",
        "mistral",
        "cohere",
        "groq",
        "vllm",
        "tgi",
    }
)


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

# ── Output & Display ──────────────────────────────────────────────────────────
OUTPUT_TRUNCATION_LENGTH: int = 500
"""Max characters kept when truncating LLM/node output for DB storage."""

SSE_CONTENT_LENGTH: int = 5000
"""Max characters for agent responses/inputs sent via SSE events."""

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
WEBHOOK_BACKGROUND_MAX_CONCURRENT: int = 10
"""Max concurrent webhook background agent tasks (deferred-execution platforms)."""

# ── RAG Defaults ─────────────────────────────────────────────────────────────
DEFAULT_RAG_RETRIEVAL_COUNT: int = 5
DEFAULT_RAG_SIMILARITY_THRESHOLD: float = 0.7
DEFAULT_RAG_THRESHOLD: float = 0.0
RAG_CONTEXT_MAX_CHARS: int = 300

# ── Agent Defaults ───────────────────────────────────────────────────────────
EPHEMERAL_AGENT_TTL_SECONDS: int = 86400
MAX_SUPERVISOR_CONTEXT_MESSAGES: int = 20
DEFAULT_TOOL_LOOP_MAX_ITERATIONS: int = 10
COMPACTION_MESSAGE_CAP: int = 80

DEFAULT_TOOL_CATEGORIES: dict[str, bool] = {
    "knowledge": True,
    "filesystem": False,
    "shell": False,
    "network": False,
    "file_storage": False,
    "human_interaction": True,
    "image_generation": False,
    "custom_tools": False,
    "mini_apps": False,
    "github": False,
    "web": False,
    "git": False,
    "scheduling": False,
}
