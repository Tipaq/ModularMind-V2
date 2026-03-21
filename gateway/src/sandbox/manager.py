"""Sandbox manager — hybrid execution with direct + Docker pool.

Hybride architecture for scalability:
- Safe commands (curl, grep, cat, etc.) → direct subprocess (~10ms)
- Unsafe commands (python, npm, etc.) → Docker sandbox (~500ms)

Gateway MUST run with --workers 1 for state consistency.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

from src.config import get_settings
from src.infra.metrics import gateway_sandboxes_active
from src.schemas import GatewayPermissions

logger = logging.getLogger(__name__)

SANDBOX_UID = 1000
SANDBOX_GID = 1000

SANDBOX_SAFE_ENV = {
    "HOME": "/home/sandbox",
    "USER": "sandbox",
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "LANG": "C.UTF-8",
}

SANDBOX_LABEL = "modularmind.gateway.sandbox"

DOCKER_CREATE_TIMEOUT = 30
DOCKER_STOP_TIMEOUT = 15
DOCKER_EXEC_TIMEOUT = 60


@dataclass
class SandboxContainer:
    """Tracks a running sandbox container."""

    container_id: str
    container_name: str
    execution_id: str
    agent_id: str
    container: Any  # docker.models.containers.Container
    last_used: float = field(default_factory=time.time)


class SandboxManager:
    """Manages per-execution Docker sandbox containers.

    Sandboxes are reused across tool calls within the same execution.
    Each agent gets an isolated workspace directory.
    """

    def __init__(self):
        self._active: dict[str, SandboxContainer] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._docker = None
        self._network: str | None = None
        self._host_workspace_root: str | None = None
        self._settings = get_settings()

    async def _get_docker(self):
        """Lazy-initialize Docker client."""
        if self._docker is not None:
            return self._docker

        import docker

        self._docker = docker.from_env()
        self._docker.ping()

        # Auto-detect network and workspace volume host path
        if not self._network:
            self._network = await self._detect_network()
        if not self._host_workspace_root:
            self._host_workspace_root = await self._detect_workspace_host_path()

        return self._docker

    async def _detect_network(self) -> str | None:
        """Try to find the Docker network the gateway is on."""
        if not self._docker:
            return None
        try:
            import socket

            hostname = socket.gethostname()
            container = await asyncio.to_thread(self._docker.containers.get, hostname)
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            for name in networks:
                if name not in ("bridge", "host", "none"):
                    logger.info("Auto-detected Docker network: %s", name)
                    return name
        except Exception:
            logger.debug("Docker network detection failed", exc_info=True)
        return None

    async def _detect_workspace_host_path(self) -> str | None:
        """Detect the host-side path for the workspace volume.

        When Gateway runs in a container with Docker socket passthrough,
        bind mount sources must use HOST paths, not container-internal paths.
        Inspects our own container mounts to find the volume source path.
        """
        if not self._docker:
            return None
        try:
            import socket

            hostname = socket.gethostname()
            container = await asyncio.to_thread(self._docker.containers.get, hostname)
            for mount in container.attrs.get("Mounts", []):
                if mount.get("Destination") == self._settings.WORKSPACE_ROOT:
                    source = mount.get("Source", "")
                    logger.info(
                        "Detected workspace host path: %s (type=%s)",
                        source, mount.get("Type"),
                    )
                    return source
        except Exception:
            logger.debug("Workspace host path detection failed", exc_info=True)
        return None

    def _get_lock(self, execution_id: str) -> asyncio.Lock:
        """Get or create a lock for an execution_id."""
        if execution_id not in self._locks:
            self._locks[execution_id] = asyncio.Lock()
        return self._locks[execution_id]

    async def acquire_or_reuse(
        self,
        execution_id: str,
        agent_id: str,
        permissions: GatewayPermissions,
    ) -> SandboxContainer:
        """Reuse existing sandbox for this execution, or create new one."""
        if execution_id in self._active:
            self._active[execution_id].last_used = time.time()
            return self._active[execution_id]

        async with self._get_lock(execution_id):
            # Double-check after lock
            if execution_id in self._active:
                self._active[execution_id].last_used = time.time()
                return self._active[execution_id]

            if len(self._active) >= self._settings.SANDBOX_MAX_ACTIVE:
                raise RuntimeError(
                    f"Maximum sandbox limit ({self._settings.SANDBOX_MAX_ACTIVE}) reached"
                )

            container = await self._create_sandbox(agent_id, permissions, execution_id)
            self._active[execution_id] = container
            gateway_sandboxes_active.set(len(self._active))
            return container

    async def _create_sandbox(
        self,
        agent_id: str,
        permissions: GatewayPermissions,
        execution_id: str,
    ) -> SandboxContainer:
        """Create a new sandbox container."""
        docker_client = await self._get_docker()

        # Prepare workspace
        workspace_dir = os.path.join(self._settings.WORKSPACE_ROOT, agent_id)
        os.makedirs(workspace_dir, exist_ok=True)

        # Fix UID/GID so sandbox user can read/write
        try:
            os.chown(workspace_dir, SANDBOX_UID, SANDBOX_GID)
        except OSError:
            logger.debug("Could not chown workspace (expected on non-Linux hosts)")

        # Build volume mounts
        mounts = self._build_mounts(agent_id, permissions, workspace_dir)

        container_name = f"mm-gw-sandbox-{execution_id[:12]}"

        labels = {
            SANDBOX_LABEL: "true",
            f"{SANDBOX_LABEL}.execution_id": execution_id,
            f"{SANDBOX_LABEL}.agent_id": agent_id,
        }

        # Always bridge — SSRF protection handled at tool level, shell controlled via allow/deny
        network = self._network or "bridge"

        try:
            raw_container = await asyncio.wait_for(
                asyncio.to_thread(
                    docker_client.containers.run,
                    image=self._settings.GATEWAY_SANDBOX_IMAGE,
                    name=container_name,
                    detach=True,
                    network_mode=network,
                    environment=SANDBOX_SAFE_ENV,
                    labels=labels,
                    volumes=mounts,
                    cap_drop=["ALL"],
                    security_opt=["no-new-privileges"],
                    mem_limit="256m",
                    memswap_limit="256m",   # No swap — hard memory cap
                    cpu_period=100000,
                    cpu_quota=50000,         # 50% of one CPU core
                    pids_limit=100,
                    tmpfs={"/tmp": "size=64m,noexec,nosuid"},
                ),
                timeout=DOCKER_CREATE_TIMEOUT,
            )
        except TimeoutError:
            raise RuntimeError(f"Sandbox creation timed out after {DOCKER_CREATE_TIMEOUT}s")
        except Exception as e:
            raise RuntimeError(f"Failed to create sandbox: {e}")

        logger.info(
            "Created sandbox %s for execution %s (agent %s)",
            container_name, execution_id, agent_id,
        )

        return SandboxContainer(
            container_id=raw_container.id,
            container_name=container_name,
            execution_id=execution_id,
            agent_id=agent_id,
            container=raw_container,
        )

    def _resolve_host_path(self, container_path: str) -> str:
        """Resolve a container-internal path to a host path for Docker bind mounts.

        When Gateway runs inside Docker with socket passthrough, the Docker daemon
        sees HOST paths, not container paths. This translates WORKSPACE_ROOT-relative
        paths to their host equivalents using the detected volume source.
        """
        if self._host_workspace_root and container_path.startswith(
            self._settings.WORKSPACE_ROOT
        ):
            relative = container_path[len(self._settings.WORKSPACE_ROOT) :]
            return self._host_workspace_root + relative
        return container_path

    def _build_mounts(
        self,
        agent_id: str,
        permissions: GatewayPermissions,
        workspace_dir: str,
    ) -> dict:
        """Build Docker volume mounts for the sandbox."""
        mounts = {}

        # Resolve to host path for Docker socket passthrough
        host_workspace_dir = self._resolve_host_path(workspace_dir)

        if permissions.filesystem.write:
            mounts[host_workspace_dir] = {"bind": "/workspace", "mode": "rw"}
        elif permissions.filesystem.read:
            mounts[host_workspace_dir] = {"bind": "/workspace", "mode": "ro"}

        # Shared workspace (read-only, opt-in)
        shared_dir = os.path.join(self._settings.WORKSPACE_ROOT, "shared")
        if os.path.exists(shared_dir) and any(
            "shared" in p for p in permissions.filesystem.read
        ):
            host_shared = self._resolve_host_path(shared_dir)
            mounts[host_shared] = {"bind": "/workspace/shared", "mode": "ro"}

        return mounts

    async def release(self, execution_id: str) -> bool:
        """Release sandbox for this execution."""
        container = self._active.pop(execution_id, None)
        self._locks.pop(execution_id, None)

        if not container:
            return False

        try:
            await asyncio.wait_for(
                asyncio.to_thread(container.container.stop, timeout=5),
                timeout=DOCKER_STOP_TIMEOUT,
            )
            await asyncio.wait_for(
                asyncio.to_thread(container.container.remove),
                timeout=DOCKER_STOP_TIMEOUT,
            )
            logger.info("Released sandbox %s", container.container_name)
        except Exception:
            logger.warning(
                "Error releasing sandbox %s", container.container_name, exc_info=True
            )

        gateway_sandboxes_active.set(len(self._active))
        return True

    async def exec_hybrid(
        self,
        agent_id: str,
        command_str: str,
        execution_id: str,
        permissions: GatewayPermissions,
        timeout: int = 30,
    ) -> tuple[int, str]:
        """Execute a command via direct subprocess or Docker sandbox.

        Safe commands bypass Docker entirely for ~10ms execution.
        Unsafe commands use the full Docker sandbox path.

        Returns (exit_code, output_string).
        """
        from src.sandbox.direct_executor import UnsafeCommandError, direct_exec, is_safe_command

        if self._settings.SANDBOX_DIRECT_EXEC and is_safe_command(command_str):
            workspace = os.path.join(self._settings.WORKSPACE_ROOT, agent_id)
            return await direct_exec(command_str, workspace, timeout=timeout)

        # Unsafe command → Docker sandbox
        sandbox = await self.acquire_or_reuse(execution_id, agent_id, permissions)
        return await self.exec_in_sandbox(execution_id, ["sh", "-c", command_str])

    async def exec_in_sandbox(
        self,
        execution_id: str,
        command: list[str],
        workdir: str = "/workspace",
    ) -> tuple[int, str]:
        """Execute a command in a Docker sandbox container.

        Returns (exit_code, output_string).
        """
        sandbox = self._active.get(execution_id)
        if not sandbox:
            raise RuntimeError(f"No sandbox found for execution {execution_id}")

        sandbox.last_used = time.time()

        result = await asyncio.wait_for(
            asyncio.to_thread(
                sandbox.container.exec_run,
                command,
                workdir=workdir,
                user="sandbox",
            ),
            timeout=DOCKER_EXEC_TIMEOUT,
        )

        exit_code = result.exit_code
        output = result.output.decode("utf-8", errors="replace") if result.output else ""
        return exit_code, output

    async def cleanup_stale(self) -> int:
        """Remove sandboxes that have been idle beyond the timeout."""
        timeout = self._settings.SANDBOX_TIMEOUT_SECONDS
        now = time.time()
        stale = [
            eid for eid, sb in self._active.items()
            if now - sb.last_used > timeout
        ]

        for eid in stale:
            await self.release(eid)

        if stale:
            logger.info("Cleaned up %d stale sandbox(es)", len(stale))
        return len(stale)

    async def cleanup_orphaned(self) -> int:
        """On startup, find and remove orphaned sandbox containers."""
        try:
            docker_client = await self._get_docker()
        except Exception:
            return 0

        removed = 0
        try:
            containers = await asyncio.to_thread(
                docker_client.containers.list,
                filters={"label": f"{SANDBOX_LABEL}=true"},
                all=True,
            )
            for container in containers:
                eid = container.labels.get(f"{SANDBOX_LABEL}.execution_id", "")
                if eid not in self._active:
                    try:
                        await asyncio.wait_for(
                            asyncio.to_thread(container.stop, timeout=5),
                            timeout=DOCKER_STOP_TIMEOUT,
                        )
                        await asyncio.wait_for(
                            asyncio.to_thread(container.remove),
                            timeout=DOCKER_STOP_TIMEOUT,
                        )
                        removed += 1
                    except Exception:
                        logger.warning("Failed to remove orphaned %s", container.name)
        except Exception:
            logger.warning("Failed to scan for orphaned sandboxes", exc_info=True)

        if removed:
            logger.info("Removed %d orphaned sandbox(es)", removed)
        return removed

    async def shutdown(self) -> None:
        """Release all active sandboxes on shutdown."""
        for eid in list(self._active.keys()):
            await self.release(eid)
        if self._docker:
            try:
                self._docker.close()
            except Exception:
                logger.debug("Docker client close failed", exc_info=True)
            self._docker = None
