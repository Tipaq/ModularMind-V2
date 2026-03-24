"""Ollama container manager — provisions and manages Ollama via Docker SDK.

Uses the same Docker socket pattern as `mcp/sidecar.py`.
The container is created on the same Docker network as the engine
so it is reachable at ``http://mm-ollama:11434``.

State (enabled / GPU mode) is persisted in the SecretsStore so the
engine can auto-recover the container after restart.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

OLLAMA_IMAGE = "ollama/ollama:latest"
CONTAINER_NAME = "mm-ollama"
OLLAMA_LABEL = "modularmind.ollama"
VOLUME_NAME = "modularmind_ollama-data"
INTERNAL_PORT = 11434
STOP_TIMEOUT_SECS = 15

SECRET_KEY_ENABLED = "OLLAMA_ENABLED"
SECRET_KEY_GPU = "OLLAMA_GPU_MODE"


@dataclass
class OllamaStatus:
    running: bool
    enabled: bool
    gpu_enabled: bool
    container_id: str | None = None
    container_name: str | None = None
    image: str | None = None


class OllamaError(Exception):
    """Error during Ollama container lifecycle."""


class OllamaManager:
    """Manages the Ollama Docker container lifecycle."""

    def __init__(self) -> None:
        self._docker: Any | None = None
        self._network: str | None = None
        self._container_id: str | None = None

    async def _get_docker(self) -> Any:
        if self._docker is not None:
            return self._docker

        try:
            import docker
        except ImportError:
            raise OllamaError("Docker SDK not installed") from None

        try:
            self._docker = docker.from_env()
            self._docker.ping()
        except Exception as e:
            self._docker = None
            raise OllamaError(f"Cannot connect to Docker daemon: {e}") from e

        if not self._network:
            self._network = await self._detect_network()

        return self._docker

    async def _detect_network(self) -> str | None:
        if not self._docker:
            return None
        try:
            import socket

            hostname = socket.gethostname()
            container = await asyncio.to_thread(
                self._docker.containers.get, hostname,
            )
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            for name in networks:
                if name not in ("bridge", "host", "none"):
                    logger.info("Ollama manager: detected Docker network %s", name)
                    return name
        except Exception:
            logger.debug("Ollama network detection failed", exc_info=True)
        return None

    async def _ensure_volume(self, client: Any) -> None:
        try:
            await asyncio.to_thread(client.volumes.get, VOLUME_NAME)
        except Exception:
            await asyncio.to_thread(
                client.volumes.create, VOLUME_NAME, driver="local",
            )
            logger.info("Created Ollama volume: %s", VOLUME_NAME)

    def _get_secrets_store(self) -> Any:
        from src.infra.secrets import secrets_store
        return secrets_store

    def _is_enabled(self) -> bool:
        return self._get_secrets_store().get(SECRET_KEY_ENABLED) == "true"

    def _is_gpu(self) -> bool:
        return self._get_secrets_store().get(SECRET_KEY_GPU) == "true"

    def _persist_state(self, enabled: bool, gpu: bool) -> None:
        store = self._get_secrets_store()
        store.set(SECRET_KEY_ENABLED, "true" if enabled else "false")
        store.set(SECRET_KEY_GPU, "true" if gpu else "false")

    async def start(self, gpu_enabled: bool = False) -> OllamaStatus:
        client = await self._get_docker()
        await self._ensure_volume(client)

        existing = await self._find_container(client)
        if existing and existing.status == "running":
            self._container_id = existing.id
            self._persist_state(enabled=True, gpu=gpu_enabled)
            logger.info("Ollama container already running: %s", existing.name)
            return await self.status()

        if existing:
            await asyncio.to_thread(existing.remove, force=True)

        volumes = {VOLUME_NAME: {"bind": "/root/.ollama", "mode": "rw"}}
        labels = {OLLAMA_LABEL: "true"}
        environment = {"OLLAMA_KEEP_ALIVE": "24h"}

        kwargs: dict[str, Any] = {
            "image": OLLAMA_IMAGE,
            "name": CONTAINER_NAME,
            "detach": True,
            "network": self._network,
            "volumes": volumes,
            "labels": labels,
            "environment": environment,
            "restart_policy": {"Name": "unless-stopped"},
        }

        if gpu_enabled:
            try:
                from docker.types import DeviceRequest

                kwargs["device_requests"] = [
                    DeviceRequest(count=-1, capabilities=[["gpu"]]),
                ]
            except ImportError:
                raise OllamaError("Docker SDK DeviceRequest not available") from None

        try:
            container = await asyncio.to_thread(client.containers.run, **kwargs)
        except Exception as e:
            raise OllamaError(f"Failed to start Ollama container: {e}") from e

        self._container_id = container.id
        self._persist_state(enabled=True, gpu=gpu_enabled)

        logger.info(
            "Started Ollama container %s (gpu=%s)", CONTAINER_NAME, gpu_enabled,
        )
        return await self.status()

    async def stop(self) -> OllamaStatus:
        client = await self._get_docker()
        container = await self._find_container(client)

        if container:
            try:
                await asyncio.to_thread(container.stop, timeout=STOP_TIMEOUT_SECS)
                await asyncio.to_thread(container.remove)
                logger.info("Stopped and removed Ollama container")
            except Exception as e:
                logger.warning("Error stopping Ollama container: %s", e)

        self._container_id = None
        self._persist_state(enabled=False, gpu=self._is_gpu())
        return await self.status()

    async def status(self) -> OllamaStatus:
        enabled = self._is_enabled()
        gpu = self._is_gpu()

        try:
            client = await self._get_docker()
            container = await self._find_container(client)
        except (OllamaError, Exception):
            return OllamaStatus(
                running=False,
                enabled=enabled,
                gpu_enabled=gpu,
            )

        if not container:
            return OllamaStatus(
                running=False,
                enabled=enabled,
                gpu_enabled=gpu,
            )

        return OllamaStatus(
            running=container.status == "running",
            enabled=enabled,
            gpu_enabled=gpu,
            container_id=container.id,
            container_name=container.name,
            image=container.image.tags[0] if container.image.tags else OLLAMA_IMAGE,
        )

    async def recover(self) -> None:
        if not self._is_enabled():
            logger.info("Ollama not enabled, skipping recovery")
            return

        try:
            client = await self._get_docker()
        except OllamaError as e:
            logger.warning("Ollama recovery: Docker not available: %s", e)
            return

        container = await self._find_container(client)

        if container and container.status == "running":
            self._container_id = container.id
            logger.info("Ollama container recovered (already running)")
            return

        if container and container.status != "running":
            try:
                await asyncio.to_thread(container.start)
                self._container_id = container.id
                logger.info("Restarted stopped Ollama container")
                return
            except Exception as e:
                logger.warning("Failed to restart Ollama: %s, recreating", e)
                await asyncio.to_thread(container.remove, force=True)

        gpu = self._is_gpu()
        try:
            await self.start(gpu_enabled=gpu)
            logger.info("Ollama container recreated during recovery (gpu=%s)", gpu)
        except OllamaError as e:
            logger.warning("Ollama recovery failed: %s", e)

    async def _find_container(self, client: Any) -> Any | None:
        try:
            containers = await asyncio.to_thread(
                client.containers.list,
                filters={"label": f"{OLLAMA_LABEL}=true"},
                all=True,
            )
            for c in containers:
                if c.name == CONTAINER_NAME:
                    return c
        except Exception:
            logger.debug("Failed to find Ollama container", exc_info=True)
        return None


ollama_manager = OllamaManager()
