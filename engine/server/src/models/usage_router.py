"""Model usage endpoints.

Read-only endpoints for listing models, catalog, providers, and pull status.
Available to all authenticated users.
"""

import logging
import math

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from src.auth import CurrentUser
from src.infra.config import get_settings
from src.models.service import get_model_service

logger = logging.getLogger(__name__)
settings = get_settings()

usage_router = APIRouter(prefix="/models", tags=["Models"])


# ── Legacy response (kept for backward compat with GET /models) ───────────


class ModelResponse(BaseModel):
    id: str
    name: str
    provider: str
    model_id: str
    display_name: str | None = None
    model_type: str = "local"
    context_window: int | None = None
    max_output_tokens: int | None = None
    parameter_size: str | None = None
    disk_size: str | None = None
    quantization: str | None = None
    family: str | None = None
    is_required: bool = False
    is_active: bool = True
    is_available: bool = False
    is_embedding: bool = False
    pull_progress: dict[str, str] | None = None
    model_metadata: dict = {}


# ── Catalog response (matches frontend CatalogModel type) ────────────────


class CatalogModelResponse(BaseModel):
    id: str
    provider: str
    model_name: str
    display_name: str
    model_type: str = "local"
    context_window: int | None = None
    max_output_tokens: int | None = None
    family: str | None = None
    size: str | None = None
    disk_size: str | None = None
    quantization: str | None = None
    capabilities: dict[str, bool] = {}
    is_required: bool = False
    is_enabled: bool = True
    is_global: bool = True
    pull_status: str | None = None
    pull_progress: int | None = None
    pull_error: str | None = None
    model_metadata: dict = {}
    created_at: str = ""
    updated_at: str = ""


class PaginatedCatalogResponse(BaseModel):
    models: list[CatalogModelResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Provider response (matches frontend ProviderConfig type) ─────────────


class ProviderConfigResponse(BaseModel):
    provider: str
    name: str
    api_key: str | None = None
    base_url: str | None = None
    is_configured: bool = False
    is_connected: bool = False
    last_tested_at: str | None = None


# ── Browsable response (matches frontend BrowsableModel type) ────────────


class BrowsableModelResponse(BaseModel):
    provider: str
    model_name: str
    display_name: str
    context_window: int | None = None
    max_output_tokens: int | None = None
    size: str | None = None
    disk_size: str | None = None
    family: str | None = None
    capabilities: dict[str, bool] = {}
    model_type: str = "local"
    source: str = "curated"


# ── Provider display names ───────────────────────────────────────────────

PROVIDER_NAMES: dict[str, str] = {
    "ollama": "Ollama",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "mistral": "Mistral",
    "cohere": "Cohere",
    "groq": "Groq",
}


# ── Helpers ──────────────────────────────────────────────────────────────


def _format_bytes(size_bytes: int | None) -> str | None:
    """Format bytes to human-readable string (e.g. 5.2 GB)."""
    if not size_bytes:
        return None
    if size_bytes >= 1_073_741_824:
        return f"{size_bytes / 1_073_741_824:.1f} GB"
    if size_bytes >= 1_048_576:
        return f"{size_bytes / 1_048_576:.0f} MB"
    return f"{size_bytes / 1024:.0f} KB"


def _derive_capabilities(model_name: str, provider: str, is_embedding: bool) -> dict[str, bool]:
    """Derive capability tags from model name and provider."""
    caps: dict[str, bool] = {}
    name = model_name.lower()

    if is_embedding:
        caps["embedding"] = True
        return caps

    caps["chat"] = True

    if any(k in name for k in ("code", "coder", "starcoder", "deepseek-coder")):
        caps["code"] = True

    if any(k in name for k in ("vision", "llava", "bakllava")):
        caps["vision"] = True

    if provider in ("openai", "anthropic") or "qwen" in name:
        caps["tools"] = True

    return caps


def _decode_progress(raw: dict) -> tuple[str | None, int | None, str | None]:
    """Extract pull_status, pull_progress, pull_error from Redis hash data.

    Redis returns bytes keys/values, so handle both bytes and str.
    """
    if not raw:
        return None, None, None

    def _get(key: str) -> str:
        val = raw.get(key) or raw.get(key.encode(encoding="utf-8"), b"")
        return val.decode() if isinstance(val, bytes) else (val or "")

    status = _get("status")
    progress_str = _get("progress")
    error = _get("error") or None

    pull_status: str | None = None
    pull_progress: int | None = None

    if status == "downloading":
        pull_status = "downloading"
        try:
            pull_progress = int(progress_str) if progress_str else 0
        except ValueError:
            pull_progress = 0
    elif status in ("ready", "completed", "success"):
        pull_status = "ready"
        pull_progress = 100
    elif status == "error":
        pull_status = "error"
    elif status == "cancelled":
        pull_status = None

    return pull_status, pull_progress, error


# ── Endpoints ────────────────────────────────────────────────────────────


@usage_router.get("")
async def list_models(user: CurrentUser) -> list[ModelResponse]:
    """List all models in the runtime catalog (legacy format)."""
    svc = get_model_service()
    models = svc.list_models()
    ollama_details = await svc.get_ollama_model_details()

    from src.infra.secrets import secrets_store
    configured_providers = secrets_store.get_configured_providers()

    results = []
    for m in models:
        parameter_size = m.get("parameter_size")
        disk_size = m.get("disk_size")
        quantization = m.get("quantization")
        family = m.get("family")
        is_available = True
        pull_progress = None
        provider = m.get("provider", "")

        if provider == "ollama":
            mid = m.get("model_id", "")
            is_available = mid in ollama_details
            if is_available:
                info = ollama_details[mid]
                parameter_size = info.get("parameter_size") or parameter_size
                disk_size = _format_bytes(info.get("size_bytes")) or disk_size
                quantization = info.get("quantization") or quantization
                family = info.get("family") or family
            else:
                pull_progress = await svc.get_pull_progress(mid)
                pull_progress = pull_progress or None
        elif provider in configured_providers:
            is_available = configured_providers[provider]

        results.append(ModelResponse(
            id=m.get("id", ""),
            name=m.get("name", ""),
            provider=m.get("provider", ""),
            model_id=m.get("model_id", ""),
            display_name=m.get("display_name"),
            model_type=m.get("model_type", "local"),
            context_window=m.get("context_window"),
            max_output_tokens=m.get("max_output_tokens"),
            parameter_size=parameter_size,
            disk_size=disk_size,
            quantization=quantization,
            family=family,
            is_required=m.get("is_required", False),
            is_active=m.get("is_active", True),
            is_available=is_available,
            is_embedding=m.get("is_embedding", False),
            pull_progress=pull_progress,
            model_metadata=m.get("model_metadata", {}),
        ))

    return results


@usage_router.get("/catalog")
async def list_catalog(
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
) -> PaginatedCatalogResponse:
    """List all models in the runtime catalog (paginated, frontend format)."""
    svc = get_model_service()
    models = svc.list_models()
    ollama_details = await svc.get_ollama_model_details()

    from src.infra.secrets import secrets_store
    configured_providers = secrets_store.get_configured_providers()

    catalog: list[CatalogModelResponse] = []
    for m in models:
        provider = m.get("provider", "")
        model_id_raw = m.get("model_id", "")
        is_embedding = m.get("is_embedding", False)

        # Start with stored metadata
        size = m.get("parameter_size")
        disk_size = m.get("disk_size")
        quantization = m.get("quantization")
        family = m.get("family")

        pull_status: str | None = None
        pull_progress: int | None = None
        pull_error: str | None = None

        if provider == "ollama":
            if model_id_raw in ollama_details:
                # Model is pulled — enrich with live data
                info = ollama_details[model_id_raw]
                size = info.get("parameter_size") or size
                disk_size = _format_bytes(info.get("size_bytes")) or disk_size
                quantization = info.get("quantization") or quantization
                family = info.get("family") or family
                pull_status = "ready"
                pull_progress = 100
            else:
                # Not pulled — check Redis for download progress
                raw_progress = await svc.get_pull_progress(model_id_raw)
                pull_status, pull_progress, pull_error = _decode_progress(raw_progress)
        else:
            # Cloud model — pull status not applicable
            pull_status = "ready" if configured_providers.get(provider) else None

        catalog.append(CatalogModelResponse(
            id=m.get("id", ""),
            provider=provider,
            model_name=model_id_raw,
            display_name=m.get("display_name") or m.get("name", model_id_raw),
            model_type=m.get("model_type", "local"),
            context_window=m.get("context_window"),
            max_output_tokens=m.get("max_output_tokens"),
            family=family,
            size=size,
            disk_size=disk_size,
            quantization=quantization,
            capabilities=_derive_capabilities(model_id_raw, provider, is_embedding),
            is_required=m.get("is_required", False),
            is_enabled=m.get("is_active", True),
            is_global=True,
            pull_status=pull_status,
            pull_progress=pull_progress,
            pull_error=pull_error,
            model_metadata=m.get("model_metadata", {}),
        ))

    total = len(catalog)
    total_pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    page_items = catalog[start : start + page_size]

    return PaginatedCatalogResponse(
        models=page_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@usage_router.get("/providers")
async def list_providers(user: CurrentUser) -> list[ProviderConfigResponse]:
    """List all known LLM providers with configuration status."""
    from src.infra.secrets import PROVIDER_KEY_MAP, secrets_store

    configured = secrets_store.get_configured_providers()

    # Check Ollama connectivity with a quick request
    ollama_connected = False
    try:
        async with httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=3.0,
        ) as client:
            resp = await client.get("/api/tags")
            ollama_connected = resp.status_code == 200
    except Exception:
        pass

    results: list[ProviderConfigResponse] = []
    for provider, display_name in PROVIDER_NAMES.items():
        if provider == "ollama":
            results.append(ProviderConfigResponse(
                provider=provider,
                name=display_name,
                base_url=settings.OLLAMA_BASE_URL,
                is_configured=True,
                is_connected=ollama_connected,
            ))
        else:
            has_key = configured.get(provider, False)
            results.append(ProviderConfigResponse(
                provider=provider,
                name=display_name,
                is_configured=has_key,
                is_connected=has_key,
            ))

    return results


@usage_router.get("/browse")
async def browse_models(
    user: CurrentUser,
    provider: str | None = Query(None),
) -> dict[str, list[BrowsableModelResponse]]:
    """Browse available models from curated lists and provider APIs.

    Returns models grouped by provider. Curated models are always included.
    When a provider API key is configured, dynamic models from the provider
    API are merged in (deduplicated by model_name, curated takes priority).
    """
    from src.infra.secrets import secrets_store
    from src.models.curated import CURATED_CLOUD_MODELS, CURATED_OLLAMA_MODELS
    from src.models.discovery import fetch_provider_models

    result: dict[str, list[BrowsableModelResponse]] = {}

    # ── Ollama curated models ────────────────────────────────────
    if provider is None or provider == "ollama":
        ollama_models: list[BrowsableModelResponse] = []
        for m in CURATED_OLLAMA_MODELS:
            ollama_models.append(BrowsableModelResponse(
                provider="ollama",
                model_name=m["model_name"],
                display_name=m["display_name"],
                context_window=m.get("context_window"),
                size=m.get("size"),
                disk_size=m.get("disk_size"),
                family=m.get("family"),
                capabilities=m.get("capabilities", {}),
                model_type="local",
                source="curated",
            ))
        result["ollama"] = ollama_models

    # ── Cloud providers ──────────────────────────────────────────
    cloud_providers = ["openai", "anthropic", "google", "mistral", "cohere", "groq"]
    for prov in cloud_providers:
        if provider is not None and provider != prov:
            continue

        # Start with curated list
        curated = CURATED_CLOUD_MODELS.get(prov, [])
        curated_names: set[str] = set()
        models: list[BrowsableModelResponse] = []

        for m in curated:
            curated_names.add(m["model_name"])
            models.append(BrowsableModelResponse(
                provider=prov,
                model_name=m["model_name"],
                display_name=m["display_name"],
                context_window=m.get("context_window"),
                max_output_tokens=m.get("max_output_tokens"),
                capabilities=m.get("capabilities", {}),
                model_type="remote",
                source="curated",
            ))

        # Merge dynamic models if API key is configured
        api_key = secrets_store.get_provider_key(prov)
        if api_key:
            dynamic = await fetch_provider_models(prov, api_key)
            for dm in dynamic:
                if dm["model_name"] not in curated_names:
                    models.append(BrowsableModelResponse(
                        provider=prov,
                        model_name=dm["model_name"],
                        display_name=dm.get("display_name", dm["model_name"]),
                        context_window=dm.get("context_window"),
                        max_output_tokens=dm.get("max_output_tokens"),
                        capabilities=dm.get("capabilities", {}),
                        model_type="remote",
                        source="dynamic",
                    ))

        result[prov] = models

    return result


@usage_router.get("/pull/{model_name}/status")
async def pull_status(model_name: str, user: CurrentUser) -> dict:
    """Get pull progress for a model."""
    svc = get_model_service()
    progress = await svc.get_pull_progress(model_name)
    return progress or {"status": "unknown"}
