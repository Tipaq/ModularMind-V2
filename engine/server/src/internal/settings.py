"""
Internal settings router.

Settings management endpoints for API keys and runtime configuration.
"""

import logging

from fastapi import APIRouter

from src.auth import CurrentUser, RequireAdmin
from src.infra.config import get_settings
from src.infra.secrets import PROVIDER_KEY_MAP, secrets_store
from src.internal.schemas import SettingsResponse, SettingsUpdate

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Internal - Settings"])


# ── Helpers ────────────────────────────────────────────────────────


def mask_key(value: str) -> str:
    """Mask an API key — shows only that a key is configured, never any characters."""
    if not value:
        return ""
    return "\u2022" * 16


def _load_persisted_overrides() -> None:
    """Load persisted overrides from secrets store into settings."""
    for attr in (
        "KNOWLEDGE_EMBEDDING_PROVIDER",
        "KNOWLEDGE_EMBEDDING_MODEL",
    ):
        stored = secrets_store.get(attr, "")
        if stored:
            setattr(settings, attr, stored)

    stored_timeout = secrets_store.get("MAX_EXECUTION_TIMEOUT", "")
    if stored_timeout:
        try:
            val = int(stored_timeout)
            if 60 <= val <= 1800:
                settings.MAX_EXECUTION_TIMEOUT = val
        except ValueError:
            pass


async def build_settings_response() -> SettingsResponse:
    """Build the current settings response with masked keys."""
    _load_persisted_overrides()

    providers = secrets_store.get_configured_providers()
    masked_keys = {}
    for provider, has_key in providers.items():
        env_key = PROVIDER_KEY_MAP[provider]
        if has_key:
            raw = secrets_store.get(env_key, "")
            masked_keys[provider] = mask_key(raw) if raw else ""
        else:
            masked_keys[provider] = ""

    ollama_enabled = secrets_store.get("OLLAMA_ENABLED") == "true"
    ollama_gpu = secrets_store.get("OLLAMA_GPU_MODE") == "true"
    ollama_running = False
    if ollama_enabled:
        try:
            from src.ollama.manager import ollama_manager

            ollama_status = await ollama_manager.status()
            ollama_running = ollama_status.running
        except Exception:
            pass

    return SettingsResponse(
        llm_api_keys=masked_keys,
        default_model=settings.DEFAULT_LLM_PROVIDER,
        telemetry_enabled=True,
        auto_sync=True,
        sync_interval_minutes=5,
        ollama_keep_alive=settings.OLLAMA_KEEP_ALIVE,
        ollama_enabled=ollama_enabled,
        ollama_gpu_mode=ollama_gpu,
        ollama_running=ollama_running,
        max_execution_timeout=settings.MAX_EXECUTION_TIMEOUT,
        knowledge_embedding_provider=(
            settings.KNOWLEDGE_EMBEDDING_PROVIDER or settings.EMBEDDING_PROVIDER
        ),
        knowledge_embedding_model=(settings.KNOWLEDGE_EMBEDDING_MODEL or settings.EMBEDDING_MODEL),
    )


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/settings", dependencies=[RequireAdmin])
async def get_settings_endpoint(user: CurrentUser) -> SettingsResponse:
    """Get current runtime settings.

    API key values are masked - only shows whether keys are configured.
    """
    return await build_settings_response()


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

    if update.max_execution_timeout is not None:
        settings.MAX_EXECUTION_TIMEOUT = update.max_execution_timeout
        secrets_store.set("MAX_EXECUTION_TIMEOUT", str(update.max_execution_timeout))

    # Embedding pipeline overrides — persist via secrets store for restart survival
    for attr in (
        "knowledge_embedding_provider",
        "knowledge_embedding_model",
    ):
        value = getattr(update, attr, None)
        if value is not None:
            upper_attr = attr.upper()
            setattr(settings, upper_attr, value)
            secrets_store.set(upper_attr, value)

    return await build_settings_response()
