"""Runtime model management router.

Owner-only endpoints for model management (pull, detailed info).
Admin-only router — not mounted in client mode.
"""

import logging

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser, RequireOwner
from src.models.schemas import ModelResponse, PullRequest, PullResponse
from src.models.service import get_model_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["Models Management"])


# ---- Management Endpoints (owner only) ----


@router.get("/{model_id}", dependencies=[RequireOwner])
async def get_model(model_id: str, user: CurrentUser) -> ModelResponse:
    """Get a single model from the runtime catalog (detailed info)."""
    svc = get_model_service()
    m = svc.get_model(model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    is_available = True
    pull_progress = None
    if m.get("provider") == "ollama":
        mid = m.get("model_id", "")
        installed = await svc.get_installed_ollama_models()
        is_available = mid in installed
        if not is_available:
            pull_progress = await svc.get_pull_progress(mid)
            pull_progress = pull_progress or None

    return ModelResponse(
        id=m.get("id", ""),
        name=m.get("name", ""),
        provider=m.get("provider", ""),
        model_id=m.get("model_id", ""),
        display_name=m.get("display_name"),
        model_type=m.get("model_type", "local"),
        context_window=m.get("context_window"),
        max_output_tokens=m.get("max_output_tokens"),
        is_required=m.get("is_required", False),
        is_active=m.get("is_active", True),
        is_available=is_available,
        is_embedding=m.get("is_embedding", False),
        pull_progress=pull_progress,
        model_metadata=m.get("model_metadata", {}),
    )


@router.post("/pull", dependencies=[RequireOwner])
async def pull_model(body: PullRequest, user: CurrentUser) -> PullResponse:
    """Trigger an Ollama model pull."""
    svc = get_model_service()

    # Auto-create catalog entry if the model isn't registered yet
    if not svc.is_model_in_catalog(body.model_name):
        model_id = body.model_name.replace(":", "-")
        svc.save_model(
            model_id,
            {
                "id": model_id,
                "name": body.display_name or body.model_name,
                "provider": "ollama",
                "model_id": body.model_name,
                "display_name": body.display_name or body.model_name,
                "model_type": "local",
                "parameter_size": body.parameter_size,
                "disk_size": body.disk_size,
                "context_window": body.context_window,
                "max_output_tokens": body.max_output_tokens,
                "is_active": True,
                "is_required": False,
                "is_embedding": False,
                "model_metadata": {},
            },
        )
        logger.info("Auto-created catalog entry for pull: %s", body.model_name)

    task_id = await svc.trigger_pull(body.model_name)
    return PullResponse(
        task_id=task_id,
        model_name=body.model_name,
        status="dispatched",
    )


@router.delete("/pull/{model_name}", dependencies=[RequireOwner])
async def cancel_pull(model_name: str, user: CurrentUser) -> dict:
    """Cancel an in-progress Ollama model pull."""
    svc = get_model_service()
    cancelled = await svc.cancel_pull(model_name)
    if not cancelled:
        raise HTTPException(status_code=404, detail="No active download found")
    return {"model_name": model_name, "status": "cancelled"}
