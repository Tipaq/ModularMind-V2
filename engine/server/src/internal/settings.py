"""
Internal settings router.

Settings management endpoints for API keys and runtime configuration.
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.auth import CurrentUser, RequireAdmin
from src.infra.config import get_settings
from src.infra.secrets import PROVIDER_KEY_MAP, secrets_store

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Internal - Settings"])


# ── Schemas ────────────────────────────────────────────────────────


class SettingsResponse(BaseModel):
    llm_api_keys: dict[str, str]
    default_model: str | None
    telemetry_enabled: bool
    auto_sync: bool
    sync_interval_minutes: int
    ollama_keep_alive: str
    memory_embedding_provider: str
    memory_embedding_model: str
    knowledge_embedding_provider: str
    knowledge_embedding_model: str


class SettingsUpdate(BaseModel):
    llm_api_keys: dict[str, str] | None = Field(None, max_length=20)
    default_model: str | None = None
    telemetry_enabled: bool | None = None
    auto_sync: bool | None = None
    sync_interval_minutes: int | None = None
    ollama_keep_alive: str | None = None
    memory_embedding_provider: str | None = None
    memory_embedding_model: str | None = None
    knowledge_embedding_provider: str | None = None
    knowledge_embedding_model: str | None = None


# ── Helpers ────────────────────────────────────────────────────────


def mask_key(value: str) -> str:
    """Mask an API key — shows only that a key is configured, never any characters."""
    if not value:
        return ""
    return "\u2022" * 16


def _load_embedding_overrides() -> None:
    """Load persisted embedding overrides from secrets store into settings."""
    for attr in (
        "MEMORY_EMBEDDING_PROVIDER",
        "MEMORY_EMBEDDING_MODEL",
        "KNOWLEDGE_EMBEDDING_PROVIDER",
        "KNOWLEDGE_EMBEDDING_MODEL",
    ):
        stored = secrets_store.get(attr, "")
        if stored:
            setattr(settings, attr, stored)


def build_settings_response() -> SettingsResponse:
    """Build the current settings response with masked keys."""
    # Ensure persisted embedding overrides are loaded
    _load_embedding_overrides()

    providers = secrets_store.get_configured_providers()
    masked_keys = {}
    for provider, has_key in providers.items():
        env_key = PROVIDER_KEY_MAP[provider]
        if has_key:
            raw = secrets_store.get(env_key, "")
            masked_keys[provider] = mask_key(raw) if raw else ""
        else:
            masked_keys[provider] = ""

    return SettingsResponse(
        llm_api_keys=masked_keys,
        default_model=settings.DEFAULT_LLM_PROVIDER,
        telemetry_enabled=True,
        auto_sync=True,
        sync_interval_minutes=5,
        ollama_keep_alive=settings.OLLAMA_KEEP_ALIVE,
        memory_embedding_provider=(
            settings.MEMORY_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
        ),
        memory_embedding_model=(
            settings.MEMORY_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
        ),
        knowledge_embedding_provider=(
            settings.KNOWLEDGE_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
        ),
        knowledge_embedding_model=(
            settings.KNOWLEDGE_EMBEDDING_MODEL or settings.EMBEDDING_MODEL
        ),
    )


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/settings", dependencies=[RequireAdmin])
async def get_settings_endpoint(user: CurrentUser) -> SettingsResponse:
    """Get current runtime settings.

    API key values are masked - only shows whether keys are configured.
    """
    return build_settings_response()


@router.patch("/settings", dependencies=[RequireAdmin])
async def update_settings_endpoint(update: SettingsUpdate, user: CurrentUser) -> SettingsResponse:
    """Update runtime settings.

    For API keys: send the provider name as key and the API key as value.
    Send an empty string to remove a key.
    """
    if update.llm_api_keys:
        for provider, key_value in update.llm_api_keys.items():
            env_key = PROVIDER_KEY_MAP.get(provider)
            if not env_key:
                continue

            if key_value == "":
                # Empty string = remove the key
                secrets_store.delete(env_key)
            else:
                # Set the new key
                secrets_store.set(env_key, key_value)

    if update.ollama_keep_alive is not None:
        settings.OLLAMA_KEEP_ALIVE = update.ollama_keep_alive

    # Embedding pipeline overrides — persist via secrets store for restart survival
    for attr in (
        "memory_embedding_provider",
        "memory_embedding_model",
        "knowledge_embedding_provider",
        "knowledge_embedding_model",
    ):
        value = getattr(update, attr, None)
        if value is not None:
            upper_attr = attr.upper()
            setattr(settings, upper_attr, value)
            secrets_store.set(upper_attr, value)

    return build_settings_response()
