"""Engine configuration — loaded from environment variables.

Uses pydantic-settings for environment-based configuration.
Mirrors the V1 runtime Settings class adapted for Redis Streams worker.
"""

import logging
from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_config_logger = logging.getLogger(__name__)

# Only allow secure HMAC-based JWT algorithms
_ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application --------------------------------------------------------
    APP_NAME: str = "ModularMind Engine"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ---- Security -----------------------------------------------------------
    SECRET_KEY: str = Field(
        default="change-me-in-production",
        description="Secret key for JWT signing. Generate with: openssl rand -hex 32",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_SECONDS: int = Field(default=3600, ge=300, le=86400)
    REFRESH_TOKEN_EXPIRE_SECONDS: int = Field(default=604800, ge=3600, le=2592000)

    # ---- Database -----------------------------------------------------------
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://modularmind:modularmind@localhost:5432/modularmind",
        description="PostgreSQL connection URL",
    )
    DB_POOL_SIZE: int = Field(default=20, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=30, ge=0, le=100)
    DB_POOL_RECYCLE: int = Field(default=1800, ge=300, le=7200)
    DB_POOL_PRE_PING: bool = True
    DB_CONNECT_TIMEOUT: int = Field(default=10, ge=1, le=60)
    DB_COMMAND_TIMEOUT: int = Field(default=30, ge=5, le=300)

    # ---- Redis --------------------------------------------------------------
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )
    REDIS_PASSWORD: str = Field(
        default="",
        description="Redis password for requirepass. If set, injected into connection URL.",
    )
    REDIS_MAX_CONNECTIONS: int = Field(default=50, ge=10, le=200)
    REDIS_SOCKET_TIMEOUT: int = Field(default=5, ge=1, le=30)
    REDIS_SOCKET_KEEPALIVE: bool = True

    # ---- LLM ----------------------------------------------------------------
    OLLAMA_BASE_URL: str = Field(
        default="http://localhost:11434",
        description="Ollama server URL",
    )
    OLLAMA_KEEP_ALIVE: str = Field(
        default="24h",
        description="How long Ollama keeps models in VRAM (e.g. '5m', '1h', '24h', '-1' for forever)",
    )
    DEFAULT_LLM_PROVIDER: str = "ollama"
    LLM_TIMEOUT_SECONDS: int = Field(default=60, ge=10, le=300)
    LLM_PROVIDER: Literal["ollama", "vllm", "tgi", "auto"] = "ollama"
    VLLM_BASE_URL: str = Field(default="", description="vLLM OpenAI-compatible API URL")
    TGI_BASE_URL: str = Field(default="", description="TGI OpenAI-compatible API URL")
    LLM_CALL_TIMEOUT: int = Field(default=120, ge=10, le=600)
    GPU_TOTAL_VRAM_GB: float = Field(
        default=0.0,
        description="Total GPU VRAM in GB. Set if server container lacks GPU access.",
    )

    # ---- Embedding ----------------------------------------------------------
    EMBEDDING_PROVIDER: str = "ollama"
    EMBEDDING_MODEL: str = "nomic-embed-text"

    # ---- Qdrant -------------------------------------------------------------
    QDRANT_URL: str = Field(default="http://localhost:6333")
    QDRANT_API_KEY: str | None = Field(default=None)
    QDRANT_COLLECTION_KNOWLEDGE: str = Field(default="knowledge")
    QDRANT_COLLECTION_MEMORY: str = Field(default="memory")
    QDRANT_ON_DISK_PAYLOAD: bool = Field(
        default=True,
        description=(
            "Store payloads on disk (lower RAM, +disk reads for reranking). "
            "Set False for RAM-resident payloads when latency matters."
        ),
    )

    # ---- Supervisor ---------------------------------------------------------
    SUPERVISOR_MODEL_ID: str = Field(
        default="ollama:qwen3:8b",
        description="Model ID for the Super Supervisor routing LLM (format: provider:model)",
    )

    # ---- Runtime Mode (removed — Engine always mounts all routers) ---------

    # ---- Sync API Keys (admin-side) -----------------------------------------
    SYNC_API_KEYS: str = Field(
        default="",
        description=(
            "Comma-separated API keys for sync manifest authentication. "
            "Generate with: openssl rand -hex 32"
        ),
    )

    @property
    def sync_api_keys_list(self) -> list[str]:
        """Parse SYNC_API_KEYS into a list."""
        return [k.strip() for k in self.SYNC_API_KEYS.split(",") if k.strip()]

    # ---- Execution ----------------------------------------------------------
    EXECUTION_MODE: Literal["inline"] = Field(
        default="inline",
        description="inline=blocking in-process execution (V2 default)",
    )
    MAX_EXECUTION_TIMEOUT: int = Field(default=600, ge=60, le=1800)
    MAX_PROMPT_LENGTH: int = Field(default=10000, ge=1000, le=50000)
    MAX_INPUT_PROMPT_SIZE: int = Field(default=32768, ge=1024, le=131072)
    MAX_INPUT_DATA_SIZE: int = Field(default=1048576, ge=1024, le=10485760)

    # ---- Memory -------------------------------------------------------------
    MAX_MEMORY_ENTRIES: int = Field(default=1000, ge=100, le=10000)
    FACT_EXTRACTION_ENABLED: bool = True
    FACT_EXTRACTION_MODEL: str = Field(
        default="",
        description="LLM model for fact extraction. Empty = use runtime default.",
    )
    FACT_EXTRACTION_MIN_MESSAGES: int = Field(default=5, ge=1, le=100)

    # ---- Memory Extraction Triggers ------------------------------------------
    MEMORY_EXTRACTION_BATCH_SIZE: int = Field(
        default=15, ge=5, le=100,
        description="Marathon threshold: extract after this many new messages even if active",
    )
    MEMORY_EXTRACTION_IDLE_SECONDS: int = Field(
        default=300, ge=60, le=3600,
        description="Idle timeout: extract when conversation idle for this many seconds",
    )
    MEMORY_EXTRACTION_SCAN_INTERVAL: int = Field(
        default=120, ge=30, le=600,
        description="How often (seconds) the scheduler scans for conversations needing extraction",
    )

    # ---- Memory Scorer -------------------------------------------------------
    MEMORY_SCORER_ENABLED: bool = True
    MEMORY_SCORER_MODEL: str = Field(
        default="",
        description="LLM model for memory scoring. Empty = use runtime default.",
    )
    MEMORY_SCORER_MIN_IMPORTANCE: float = Field(default=0.2, ge=0.0, le=1.0)

    # ---- Memory Decay --------------------------------------------------------
    MEMORY_DECAY_EPISODIC_HALF_LIFE: int = Field(default=30, ge=1)
    MEMORY_DECAY_SEMANTIC_HALF_LIFE: int = Field(default=365, ge=1)
    MEMORY_DECAY_PROCEDURAL_HALF_LIFE: int = Field(default=730, ge=1)
    MEMORY_DECAY_PRUNE_THRESHOLD: float = Field(default=0.05, ge=0.0, le=1.0)

    # ---- Memory Retrieval Scoring --------------------------------------------
    MEMORY_SCORE_WEIGHT_RECENCY: float = Field(default=0.15, ge=0.0, le=1.0)
    MEMORY_SCORE_WEIGHT_IMPORTANCE: float = Field(default=0.25, ge=0.0, le=1.0)
    MEMORY_SCORE_WEIGHT_RELEVANCE: float = Field(default=0.45, ge=0.0, le=1.0)
    MEMORY_SCORE_WEIGHT_FREQUENCY: float = Field(default=0.15, ge=0.0, le=1.0)

    # ---- Conversation Indexing ----------------------------------------------
    CONVERSATION_INDEX_MODE: str = Field(
        default="summary",
        description="summary|messages|both — controls cross-conversation indexing granularity",
    )
    CONVERSATION_INDEXING_ENABLED: bool = True

    # ---- Reranking ----------------------------------------------------------
    RERANK_PROVIDER: str = Field(
        default="none",
        description="none|cohere|cross-encoder",
    )
    RERANK_MODEL: str = Field(default="")
    COHERE_API_KEY: str = Field(default="")

    # ---- SSE -----------------------------------------------------------------
    SSE_KEEPALIVE_INTERVAL: int = Field(default=15, ge=5, le=60)
    SSE_MESSAGE_BUFFER_TTL: int = Field(default=60, ge=10, le=300)

    # ---- Rate Limiting ------------------------------------------------------
    RATE_LIMIT_REQUESTS: int = Field(default=100, ge=10, le=1000)
    RATE_LIMIT_BURST: int = Field(default=20, ge=0, le=100)
    RATE_LIMIT_EXECUTIONS: str = "10/minute"
    RATE_LIMIT_EXECUTIONS_POLL: str = "100/minute"
    RATE_LIMIT_READS: str = "100/minute"
    RATE_LIMIT_LOGIN: str = "5/minute"

    # ---- Config / Domain Config ---------------------------------------------
    CONFIG_DIR: str = Field(
        default="/data/config",
        description="Directory for agent/graph config files",
    )
    SYNC_SOURCE: str = Field(
        default="",
        description="URL to pull manifest from. Empty = standalone mode.",
    )
    CONFIG_RELOAD_DEBOUNCE: int = Field(default=1000, ge=100, le=5000)

    # ---- Execution Tracing --------------------------------------------------
    ENABLE_EXECUTION_TRACING: bool = True
    TRACE_LOG_PROMPTS: bool = False
    TRACE_MAX_CONTENT_LENGTH: int = Field(default=500, ge=100, le=5000)

    # ---- Logging ------------------------------------------------------------
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: Literal["json", "plain"] = "json"

    # ---- CORS ---------------------------------------------------------------
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed origins",
    )
    CORS_ALLOW_CREDENTIALS: bool = True

    # ---- Fine-Tuning --------------------------------------------------------
    FINETUNING_ENABLED: bool = True
    FINETUNING_STORAGE_DIR: str = Field(
        default="/data/fine_tuning",
        description="Directory for fine-tuning datasets and JSONL exports",
    )
    FINETUNING_MIN_EXAMPLES: int = Field(default=50, ge=10, le=10000)
    FINETUNING_MAX_DATASET_SIZE_MB: int = Field(default=512, ge=1, le=10240)
    FINETUNING_DEFAULT_PROVIDER: str = "openai"
    FINETUNING_AUTO_RETRAIN_ENABLED: bool = False
    FINETUNING_AUTO_RETRAIN_THRESHOLD: int = Field(default=100, ge=10, le=10000)
    FINETUNING_MAX_CONCURRENT_JOBS: int = Field(default=3, ge=1, le=10)
    FINETUNING_JOB_TIMEOUT_HOURS: int = Field(default=24, ge=1, le=168)
    FINETUNING_MAX_TOKENS_PER_EXAMPLE: int = Field(
        default=16384,
        ge=100,
        le=65536,
        description="Max tokens per training example.",
    )
    AB_TESTING_ENABLED: bool = True

    # ---- MCP ----------------------------------------------------------------
    MCP_BOOTSTRAP_SERVERS: str = Field(
        default="",
        description=(
            "Comma-separated MCP servers to auto-register on startup. "
            "Format: name|url  (e.g. 'Brave Search|http://mcp-brave:9100'). "
            "Servers already registered (by URL) are skipped."
        ),
    )
    MCP_AUTO_ENABLE: bool = Field(
        default=True,
        description=(
            "When True, conversations with no explicit enabled_mcp_servers "
            "will use all registered MCP servers as a default."
        ),
    )
    MCP_AUTO_DEPLOY_FREE: bool = Field(
        default=True,
        description=(
            "When True, MCP catalog entries that require no credentials "
            "are automatically deployed as Docker sidecars on startup."
        ),
    )
    MCP_TOOL_CALL_TIMEOUT: float = Field(
        default=60.0,
        ge=5.0,
        le=300.0,
        description="Default timeout in seconds for individual MCP tool calls",
    )

    # ---- Platform Sync ------------------------------------------------------
    PLATFORM_URL: str = ""
    ENGINE_API_KEY: str = ""
    SYNC_INTERVAL_SECONDS: int = 300

    # ---- Fair-Scheduling ----------------------------------------------------
    FAIR_SCHEDULE_MAX_PER_TEAM: int = Field(default=10, ge=1, le=100)
    FAIR_SCHEDULE_GLOBAL_MAX: int = Field(default=50, ge=1, le=500)

    # ---- Uvicorn ------------------------------------------------------------
    UVICORN_WORKERS: int = Field(default=4, ge=1, le=16)

    # ---- Prometheus ---------------------------------------------------------
    PROMETHEUS_ENABLED: bool = True

    # ---- Auth ---------------------------------------------------------------
    # (kept for backward compat if anything still references these names)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # =====================================================================
    # Validators
    # =====================================================================

    @field_validator("JWT_ALGORITHM")
    @classmethod
    def validate_jwt_algorithm(cls, v: str) -> str:
        if v not in _ALLOWED_JWT_ALGORITHMS:
            raise ValueError(
                f"JWT_ALGORITHM must be one of {sorted(_ALLOWED_JWT_ALGORITHMS)}, got '{v}'"
            )
        return v

    @model_validator(mode="after")
    def warn_on_dangerous_llm_urls(self) -> "Settings":
        """Reject URLs pointing to cloud metadata endpoints (SSRF)
        and warn on embedded credentials in service URLs.
        """
        _CLOUD_METADATA = frozenset({
            "169.254.169.254", "metadata.google.internal", "100.100.100.200",
        })
        for field_name in (
            "OLLAMA_BASE_URL", "VLLM_BASE_URL", "TGI_BASE_URL",
            "QDRANT_URL", "SYNC_SOURCE",
        ):
            url = getattr(self, field_name, "")
            if not url:
                continue
            parsed = urlparse(url)
            hostname = (parsed.hostname or "").lower()
            if hostname in _CLOUD_METADATA:
                raise ValueError(
                    f"{field_name} points to a cloud metadata endpoint "
                    f"({hostname}). This is a critical SSRF risk."
                )
            if field_name == "SYNC_SOURCE" and not self.DEBUG:
                if parsed.scheme != "https":
                    _config_logger.warning(
                        "SYNC_SOURCE uses %s instead of https — "
                        "sync traffic will not be encrypted",
                        parsed.scheme,
                    )
            if parsed.username or parsed.password:
                _config_logger.warning(
                    "%s contains embedded credentials — consider using "
                    "separate auth headers instead",
                    field_name,
                )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        """Get CORS origins as a list.

        Rejects wildcard '*' when credentials are enabled to prevent
        CORS misconfiguration.
        """
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        if self.CORS_ALLOW_CREDENTIALS and "*" in origins:
            raise ValueError(
                "CORS_ORIGINS='*' is not allowed when CORS_ALLOW_CREDENTIALS=True. "
                "Specify explicit origins instead."
            )
        return origins


# Module-level singleton for modules that do `from src.infra.config import settings`
settings = Settings()


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance.

    Many V1-ported modules call ``get_settings()`` instead of using the
    module-level ``settings`` singleton directly.  This function is
    lru-cached so it returns the same object on every call.
    """
    return settings
