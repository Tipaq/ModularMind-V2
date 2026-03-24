"""Ollama management endpoints.

Admin-only endpoints to start, stop, and query the Ollama container.
"""

import asyncio
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
    gpu_available: bool = False
    gpu_name: str | None = None
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


async def _detect_gpu() -> tuple[bool, str | None]:
    try:
        import docker

        client = docker.from_env()
        info = await asyncio.to_thread(client.info)
        runtimes = info.get("Runtimes", {})
        if "nvidia" in runtimes:
            gpu_name = None
            try:
                result = await asyncio.to_thread(
                    client.containers.run,
                    "nvidia/cuda:12.0.0-base-ubuntu22.04",
                    "nvidia-smi --query-gpu=name --format=csv,noheader",
                    runtime="nvidia",
                    remove=True,
                    stdout=True,
                    stderr=False,
                )
                gpu_name = result.decode().strip().split("\n")[0] if result else None
            except Exception:
                gpu_name = "NVIDIA GPU (driver detected)"
            return True, gpu_name
    except Exception:
        pass
    return False, None


@router.get("/status", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def get_ollama_status(user: CurrentUser) -> OllamaStatusResponse:
    status = await ollama_manager.status()
    gpu_available, gpu_name = await _detect_gpu()
    resp = _to_response(status)
    resp.gpu_available = gpu_available
    resp.gpu_name = gpu_name
    return resp


@router.post("/start", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def start_ollama(
    body: OllamaStartRequest,
    user: CurrentUser,
) -> OllamaStatusResponse:
    if body.gpu_enabled:
        gpu_available, _ = await _detect_gpu()
        if not gpu_available:
            raise HTTPException(
                status_code=400,
                detail="GPU not available. Install NVIDIA drivers and nvidia-container-toolkit first.",
            )
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
        logger.error("OllamaError stopping Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error stopping Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return _to_response(status)
