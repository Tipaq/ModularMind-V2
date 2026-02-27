"""Engine configuration — loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Core ---
    SECRET_KEY: str = "change-me-in-production"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://modularmind:modularmind@localhost:5432/modularmind"

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Qdrant ---
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_KNOWLEDGE: str = "knowledge"
    QDRANT_COLLECTION_MEMORY: str = "memory"

    # --- LLM ---
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    DEFAULT_LLM_PROVIDER: str = "ollama"
    LLM_TIMEOUT_SECONDS: int = 60

    # --- Embedding ---
    EMBEDDING_PROVIDER: str = "ollama"
    EMBEDDING_MODEL: str = "nomic-embed-text"

    # --- Execution ---
    MAX_EXECUTION_TIMEOUT: int = 600

    # --- Platform Sync ---
    PLATFORM_URL: str = ""
    ENGINE_API_KEY: str = ""
    SYNC_INTERVAL_SECONDS: int = 300

    # --- Memory ---
    MAX_MEMORY_ENTRIES: int = 1000
    FACT_EXTRACTION_ENABLED: bool = True

    # --- MCP ---
    MCP_BOOTSTRAP_SERVERS: str = ""
    MCP_AUTO_ENABLE: bool = True
    MCP_TOOL_CALL_TIMEOUT: int = 60

    # --- Auth ---
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}


settings = Settings()
