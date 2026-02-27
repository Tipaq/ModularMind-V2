"""Model usage endpoints.

Read-only endpoints for listing models and checking pull status.
Available to all authenticated users.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.auth import CurrentUser
from src.models.service import get_model_service

logger = logging.getLogger(__name__)

usage_router = APIRouter(prefix="/models", tags=["Models"])


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


def _format_bytes(size_bytes: int | None) -> str | None:
    """Format bytes to human-readable string (e.g. 5.2 GB)."""
    if not size_bytes:
        return None
    if size_bytes >= 1_073_741_824:
        return f"{size_bytes / 1_073_741_824:.1f} GB"
    if size_bytes >= 1_048_576:
        return f"{size_bytes / 1_048_576:.0f} MB"
    return f"{size_bytes / 1024:.0f} KB"


@usage_router.get("")
async def list_models(user: CurrentUser) -> list[ModelResponse]:
    """List all models in the runtime catalog."""
    svc = get_model_service()
    models = svc.list_models()
    ollama_details = await svc.get_ollama_model_details()

    # Check which cloud providers have API keys configured
    from src.infra.secrets import secrets_store
    configured_providers = secrets_store.get_configured_providers()

    results = []
    for m in models:
        # Always start with stored metadata from JSON
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
                # Enrich with live Ollama data when pulled
                info = ollama_details[mid]
                parameter_size = info.get("parameter_size") or parameter_size
                disk_size = _format_bytes(info.get("size_bytes")) or disk_size
                quantization = info.get("quantization") or quantization
                family = info.get("family") or family
            else:
                pull_progress = await svc.get_pull_progress(mid)
                pull_progress = pull_progress or None
        elif provider in configured_providers:
            # Cloud providers: available only if API key is configured
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


@usage_router.get("/pull/{model_name}/status")
async def pull_status(model_name: str, user: CurrentUser) -> dict:
    """Get pull progress for a model."""
    svc = get_model_service()
    progress = await svc.get_pull_progress(model_name)
    return progress or {"status": "unknown"}
