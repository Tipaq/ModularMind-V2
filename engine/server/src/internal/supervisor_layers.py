"""
Internal supervisor layers router.

Read and update the supervisor prompt layer files (identity, personality,
tool_task) that define the supervisor's "soul".  Files live on disk at
``prompt_layers/layers/`` and are cached in memory via ``loader.py``.
After a write the in-memory cache is invalidated so the next LLM call
picks up the change immediately.
"""

import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.auth import CurrentUser, RequireOwner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/supervisor/layers", tags=["Internal - Supervisor Layers"])

# Allowed layer files and their labels
_LAYER_DIR = Path(__file__).resolve().parent.parent / "prompt_layers" / "layers"

_ALLOWED_LAYERS: dict[str, str] = {
    "supervisor_identity": "supervisor_identity.md",
    "supervisor_personality": "supervisor_personality.md",
    "tool_task": "tool_task.md",
}

_LAYER_LABELS: dict[str, str] = {
    "supervisor_identity": "Identity",
    "supervisor_personality": "Personality",
    "tool_task": "Tool Instructions",
}

_LAYER_DESCRIPTIONS: dict[str, str] = {
    "supervisor_identity": "Defines who the supervisor is — its role, capabilities, and core purpose. Stable layer, rarely changed.",
    "supervisor_personality": "Defines how the supervisor communicates — tone, style, behavior patterns. Can be overridden per conversation.",
    "tool_task": "Instructions for the supervisor when using external tools (web search, APIs). Defines the tool-use workflow.",
}


# ── Schemas ────────────────────────────────────────────────────────


class LayerInfo(BaseModel):
    key: str
    label: str
    description: str
    content: str
    filename: str


class LayersResponse(BaseModel):
    layers: list[LayerInfo]


class LayerUpdateRequest(BaseModel):
    content: str = Field(..., min_length=0, max_length=10000)


class LayerUpdateResponse(BaseModel):
    key: str
    content: str
    status: str = "updated"


# ── Helpers ────────────────────────────────────────────────────────


def _read_layer(key: str) -> str:
    filename = _ALLOWED_LAYERS.get(key)
    if not filename:
        return ""
    path = _LAYER_DIR / filename
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _write_layer(key: str, content: str) -> None:
    filename = _ALLOWED_LAYERS.get(key)
    if not filename:
        raise ValueError(f"Unknown layer key: {key}")
    path = _LAYER_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _invalidate_loader_cache() -> None:
    """Clear the lru_cache in loader.py so next read picks up disk changes."""
    try:
        from src.prompt_layers.loader import load_layer
        load_layer.cache_clear()
    except Exception as e:
        logger.warning("Failed to clear layer loader cache: %s", e)


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("", response_model=LayersResponse, dependencies=[RequireOwner])
async def get_supervisor_layers(user: CurrentUser) -> LayersResponse:
    """Get all supervisor prompt layers."""
    layers = []
    for key, filename in _ALLOWED_LAYERS.items():
        layers.append(LayerInfo(
            key=key,
            label=_LAYER_LABELS.get(key, key),
            description=_LAYER_DESCRIPTIONS.get(key, ""),
            content=_read_layer(key),
            filename=filename,
        ))
    return LayersResponse(layers=layers)


@router.patch(
    "/{layer_key}",
    response_model=LayerUpdateResponse,
    dependencies=[RequireOwner],
)
async def update_supervisor_layer(
    layer_key: str,
    body: LayerUpdateRequest,
    user: CurrentUser,
) -> LayerUpdateResponse:
    """Update a single supervisor prompt layer."""
    if layer_key not in _ALLOWED_LAYERS:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"Unknown layer '{layer_key}'. Valid: {list(_ALLOWED_LAYERS.keys())}",
        )

    _write_layer(layer_key, body.content)
    _invalidate_loader_cache()

    logger.info(
        "Supervisor layer '%s' updated by user %s (%d chars)",
        layer_key, user.id, len(body.content),
    )

    return LayerUpdateResponse(key=layer_key, content=body.content)
