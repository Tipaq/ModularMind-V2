"""Ollama management endpoints.

Admin-only endpoints to start, stop, and query the Ollama container.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.auth.dependencies import CurrentUser, RequireAdmin
from src.ollama.manager import OllamaError, OllamaStatus, ollama_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/ollama", tags=["Ollama"])


class OllamaStartRequest(BaseModel):
    gpu_enabled: bool = False


class OllamaStatusResponse(BaseModel):
    running: bool
    enabled: bool
    gpu_enabled: bool
    container_id: str | None = None
    container_name: str | None = None
    image: str | None = None


def _to_response(status: OllamaStatus) -> OllamaStatusResponse:
    return OllamaStatusResponse(
        running=status.running,
        enabled=status.enabled,
        gpu_enabled=status.gpu_enabled,
        container_id=status.container_id,
        container_name=status.container_name,
        image=status.image,
    )


@router.get("/status", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def get_ollama_status(user: CurrentUser) -> OllamaStatusResponse:
    status = await ollama_manager.status()
    return _to_response(status)


@router.post("/start", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def start_ollama(
    body: OllamaStartRequest,
    user: CurrentUser,
) -> OllamaStatusResponse:
    try:
        status = await ollama_manager.start(gpu_enabled=body.gpu_enabled)
    except OllamaError as e:
        logger.error("OllamaError starting Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error starting Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return _to_response(status)


@router.post("/stop", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def stop_ollama(user: CurrentUser) -> OllamaStatusResponse:
    try:
        status = await ollama_manager.stop()
    except OllamaError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error stopping Ollama")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return _to_response(status)
