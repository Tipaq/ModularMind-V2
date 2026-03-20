"""Gateway configuration — loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    """Gateway service settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application --------------------------------------------------------
    APP_NAME: str = "ModularMind Gateway"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ---- Server -------------------------------------------------------------
    GATEWAY_PORT: int = Field(default=8200, ge=1024, le=65535)

    # ---- Security -----------------------------------------------------------
    SECRET_KEY: str = Field(
        default="change-me-in-production",
        description="Must match engine SECRET_KEY for HMAC token verification",
    )

    # ---- Database -----------------------------------------------------------
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://modularmind:modularmind@localhost:5432/modularmind",
        description="Shared PostgreSQL — same DB as engine",
    )
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=50)
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0, le=100)
    DB_POOL_RECYCLE: int = Field(default=3600, ge=60)
    DB_POOL_PRE_PING: bool = True
    DB_CONNECT_TIMEOUT: int = Field(default=10, ge=1, le=60)
    DB_COMMAND_TIMEOUT: int = Field(default=30, ge=5, le=300)

    # ---- Redis --------------------------------------------------------------
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Shared Redis — same as engine",
    )
    REDIS_MAX_CONNECTIONS: int = Field(default=10, ge=1, le=100)
    REDIS_SOCKET_TIMEOUT: int = Field(default=5, ge=1, le=30)
    REDIS_SOCKET_KEEPALIVE: bool = True

    # ---- Sandbox ------------------------------------------------------------
    GATEWAY_SANDBOX_IMAGE: str = Field(
        default="modularmind/gateway-sandbox:latest",
        description="Docker image for sandbox containers",
    )
    SANDBOX_TIMEOUT_SECONDS: int = Field(
        default=300,
        ge=30,
        le=3600,
        description="Idle timeout before sandbox is auto-released",
    )
    SANDBOX_MAX_ACTIVE: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum concurrent sandbox containers",
    )
    SANDBOX_DIRECT_EXEC: bool = Field(
        default=True,
        description="Enable direct subprocess for safe commands (bypass Docker)",
    )

    # ---- Workspace ----------------------------------------------------------
    WORKSPACE_ROOT: str = Field(
        default="/data/workspaces",
        description="Root directory for agent workspaces",
    )
    WORKSPACE_MAX_SIZE_MB: int = Field(default=500, ge=10, le=10000)
    WORKSPACE_MAX_FILE_SIZE: int = Field(
        default=10_485_760,
        ge=1024,
        description="Max file size in bytes (default 10MB)",
    )
    WORKSPACE_RETENTION_DAYS: int = Field(default=30, ge=1, le=365)

    # ---- Approval -----------------------------------------------------------
    APPROVAL_TIMEOUT_SECONDS: int = Field(default=300, ge=30, le=3600)
    APPROVAL_MAX_PENDING_PER_AGENT: int = Field(default=50, ge=1, le=500)
    APPROVAL_RETENTION_DAYS: int = Field(default=30, ge=1, le=365)

    # ---- Permission Cache ---------------------------------------------------
    PERMISSION_CACHE_TTL: float = Field(default=60.0, ge=5.0, le=600.0)

    # ---- Prometheus ---------------------------------------------------------
    PROMETHEUS_ENABLED: bool = True


settings = GatewaySettings()


@lru_cache
def get_settings() -> GatewaySettings:
    return settings
