"""Ollama management endpoints.

Admin-only endpoints to start, stop, and query the Ollama container.
Includes GPU hardware/driver/toolkit detection.
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


class GpuInfo(BaseModel):
    hardware_detected: bool = False
    hardware_name: str | None = None
    drivers_installed: bool = False
    driver_version: str | None = None
    toolkit_installed: bool = False
    ready: bool = False


class OllamaStatusResponse(BaseModel):
    running: bool
    enabled: bool
    gpu_enabled: bool
    gpu: GpuInfo
    container_id: str | None = None
    container_name: str | None = None
    image: str | None = None


def _to_response(status: OllamaStatus, gpu: GpuInfo) -> OllamaStatusResponse:
    return OllamaStatusResponse(
        running=status.running,
        enabled=status.enabled,
        gpu_enabled=status.gpu_enabled,
        gpu=gpu,
        container_id=status.container_id,
        container_name=status.container_name,
        image=status.image,
    )


async def _detect_gpu() -> GpuInfo:
    """Detect GPU availability via Docker daemon info.

    When nvidia-container-toolkit is installed, the Docker daemon
    reports an 'nvidia' runtime. We then query nvidia-smi for details.
    """
    info = GpuInfo()

    try:
        import docker

        client = docker.from_env()
        docker_info = await asyncio.to_thread(client.info)
        runtimes = docker_info.get("Runtimes", {})

        if "nvidia" not in runtimes:
            return info

        info.hardware_detected = True
        info.drivers_installed = True
        info.toolkit_installed = True
        info.ready = True

        try:
            result = await asyncio.to_thread(
                client.containers.run,
                "nvidia/cuda:12.0.0-base-ubuntu22.04",
                "nvidia-smi --query-gpu=driver_version,name --format=csv,noheader",
                runtime="nvidia",
                remove=True,
                stdout=True,
                stderr=False,
            )
            output = result.decode().strip() if result else ""
            if output:
                parts = output.split(",", 1)
                info.driver_version = parts[0].strip()
                info.hardware_name = parts[1].strip() if len(parts) > 1 else "NVIDIA GPU"
        except (RuntimeError, OSError, KeyError) as exc:
            logger.debug("nvidia-smi query failed: %s", exc)
            info.hardware_name = "NVIDIA GPU"

    except (ImportError, RuntimeError, OSError, ConnectionError) as exc:
        logger.debug("GPU detection failed: %s", exc)

    return info


@router.get("/status", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def get_ollama_status(user: CurrentUser) -> OllamaStatusResponse:
    status = await ollama_manager.status()
    gpu = await _detect_gpu()
    return _to_response(status, gpu)


@router.post("/start", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def start_ollama(
    body: OllamaStartRequest,
    user: CurrentUser,
) -> OllamaStatusResponse:
    if body.gpu_enabled:
        gpu = await _detect_gpu()
        if not gpu.ready:
            missing: list[str] = []
            if not gpu.hardware_detected:
                missing.append("No NVIDIA GPU detected")
            elif not gpu.drivers_installed:
                missing.append("NVIDIA drivers not installed")
            elif not gpu.toolkit_installed:
                missing.append("nvidia-container-toolkit not installed")
            raise HTTPException(
                status_code=400,
                detail=" — ".join(missing) + ". See Infrastructure tab for setup instructions.",
            )
    try:
        status = await ollama_manager.start(gpu_enabled=body.gpu_enabled)
    except OllamaError as e:
        logger.error("OllamaError starting Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    except (RuntimeError, OSError, ConnectionError, ImportError) as e:
        logger.exception("Unexpected error starting Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    gpu = await _detect_gpu()
    return _to_response(status, gpu)


@router.post("/stop", response_model=OllamaStatusResponse, dependencies=[RequireAdmin])
async def stop_ollama(user: CurrentUser) -> OllamaStatusResponse:
    try:
        status = await ollama_manager.stop()
    except OllamaError as e:
        logger.error("OllamaError stopping Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    except (RuntimeError, OSError, ConnectionError) as e:
        logger.exception("Unexpected error stopping Ollama: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    gpu = await _detect_gpu()
    return _to_response(status, gpu)
