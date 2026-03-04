"""MCP Sidecar Manager — provisions mcp-proxy Docker containers on demand.

Wraps stdio-based MCP servers in Streamable HTTP sidecars using
ghcr.io/sparfenyuk/mcp-proxy.  Containers are created on the same Docker
network as the server so the MCPClient can reach them via internal DNS.

Lifecycle:
  1. User picks a catalog entry + provides secrets
  2. SidecarManager.deploy() → creates container → returns internal URL
  3. MCPRegistry registers the server (managed=True, SSRF check skipped)
  4. On undeploy/shutdown → container removed

Requires: Docker socket mounted on the server container
  e.g.  volumes: ["/var/run/docker.sock:/var/run/docker.sock"]
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from src.mcp.catalog import get_catalog_entry

logger = logging.getLogger(__name__)

MCP_PROXY_IMAGE = "ghcr.io/sparfenyuk/mcp-proxy:latest"
MCP_NODE_PROXY_IMAGE = "modularmind/mcp-node-proxy:latest"
SIDECAR_INTERNAL_PORT = 9100
SIDECAR_LABEL_PREFIX = "modularmind.mcp.sidecar"


class SidecarError(Exception):
    """Error during sidecar lifecycle operations."""


class SidecarInfo:
    """Tracks a running sidecar container."""

    def __init__(
        self,
        container_id: str,
        container_name: str,
        catalog_id: str,
        internal_url: str,
        server_id: str,
    ):
        self.container_id = container_id
        self.container_name = container_name
        self.catalog_id = catalog_id
        self.internal_url = internal_url
        self.server_id = server_id


class SidecarManager:
    """Manages Docker sidecar containers for MCP proxy."""

    _MAX_SIDECARS = 20

    def __init__(self, docker_network: str | None = None):
        self._docker = None
        self._network = docker_network
        self._sidecars: dict[str, SidecarInfo] = {}  # server_id → info
        self._deploy_semaphore = asyncio.Semaphore(3)  # max 3 concurrent deploys

    async def _get_docker(self):
        """Lazy-initialize Docker client."""
        if self._docker is not None:
            return self._docker

        try:
            import docker
        except ImportError:
            raise SidecarError(
                "Docker SDK not installed. Run: pip install docker"
            )

        try:
            self._docker = docker.from_env()
            self._docker.ping()
        except Exception as e:
            self._docker = None
            raise SidecarError(f"Cannot connect to Docker daemon: {e}")

        # Auto-detect network if not set
        if not self._network:
            self._network = await self._detect_network()

        return self._docker

    async def _detect_network(self) -> str | None:
        """Try to find the Docker network the runtime is on."""
        if not self._docker:
            return None
        try:
            # Run in thread to avoid blocking
            import socket
            hostname = socket.gethostname()
            container = await asyncio.to_thread(
                self._docker.containers.get, hostname
            )
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            # Return the first non-default network
            for name in networks:
                if name not in ("bridge", "host", "none"):
                    logger.info("Auto-detected Docker network: %s", name)
                    return name
        except Exception:
            logger.debug("Docker network detection failed", exc_info=True)
        logger.warning("Could not detect Docker network, sidecars may not be reachable")
        return None

    @property
    def is_available(self) -> bool:
        """Check if Docker is accessible (without connecting)."""
        try:
            import docker  # noqa: F401
            return True
        except ImportError:
            return False

    async def deploy(
        self,
        catalog_id: str,
        secrets: dict[str, str],
        server_id: str | None = None,
    ) -> SidecarInfo:
        """Deploy a sidecar container for a catalog entry.

        Args:
            catalog_id: Catalog entry ID (e.g., "brave-search")
            secrets: Environment variables the server needs (e.g., {"BRAVE_API_KEY": "..."})
            server_id: Optional pre-generated server UUID

        Returns:
            SidecarInfo with the internal URL for MCPRegistry
        """
        if len(self._sidecars) >= self._MAX_SIDECARS:
            raise SidecarError(
                f"Maximum sidecar limit ({self._MAX_SIDECARS}) reached. "
                "Undeploy unused sidecars first."
            )

        async with self._deploy_semaphore:
            return await self._deploy_inner(catalog_id, secrets, server_id)

    async def _deploy_inner(
        self,
        catalog_id: str,
        secrets: dict[str, str],
        server_id: str | None = None,
    ) -> SidecarInfo:
        """Internal deploy implementation (guarded by semaphore)."""
        entry = get_catalog_entry(catalog_id)
        if not entry:
            raise SidecarError(f"Unknown catalog entry: {catalog_id}")

        # Work on a copy to avoid mutating the caller's dict
        secrets = dict(secrets)

        # Merge entry defaults into secrets (user-provided values take precedence)
        if entry.default_env:
            for k, v in entry.default_env.items():
                secrets.setdefault(k, v)

        # Validate required secrets (after defaults merge)
        missing = [
            s.key for s in entry.required_secrets
            if s.required and s.key not in secrets
        ]
        if missing:
            raise SidecarError(f"Missing required secrets: {', '.join(missing)}")

        docker_client = await self._get_docker()
        server_id = server_id or str(uuid.uuid4())
        container_name = f"mm-mcp-{entry.id}-{server_id[:8]}"

        # For postgres, the connection URL is passed as a positional arg
        postgres_url = None
        if entry.id == "postgres" and "POSTGRES_URL" in secrets:
            postgres_url = secrets.pop("POSTGRES_URL")

        # Determine image: custom Docker image, or node-proxy for npm packages
        if entry.docker_image:
            image = entry.docker_image
        elif entry.npm_package:
            image = MCP_NODE_PROXY_IMAGE  # npm entries need Node.js
        else:
            image = MCP_PROXY_IMAGE

        # Build command based on mode
        # --host 0.0.0.0 is required so the proxy listens on all interfaces
        # (default is 127.0.0.1 which is unreachable from other containers)
        if entry.docker_image:
            # Docker image mode: use server_command
            command = [
                "--pass-environment",
                f"--port={SIDECAR_INTERNAL_PORT}",
                "--host=0.0.0.0",
                "--",
                *entry.server_command,
            ]
        else:
            # npm mode: use npx
            command = [
                "--pass-environment",
                f"--port={SIDECAR_INTERNAL_PORT}",
                "--host=0.0.0.0",
                "--",
                "npx", "-y", entry.npm_package,
                *entry.default_args,
            ]
            # Postgres positional arg (npm-mode only)
            if postgres_url:
                command.append(postgres_url)

        labels = {
            f"{SIDECAR_LABEL_PREFIX}": "true",
            f"{SIDECAR_LABEL_PREFIX}.server-id": server_id,
            f"{SIDECAR_LABEL_PREFIX}.catalog-id": catalog_id,
            f"{SIDECAR_LABEL_PREFIX}.image": image,
        }

        mem = entry.mem_limit or "256m"
        vols = entry.volumes or {}

        try:
            container = await asyncio.to_thread(
                docker_client.containers.run,
                image=image,
                command=command,
                name=container_name,
                environment=secrets,
                labels=labels,
                detach=True,
                network=self._network,
                mem_limit=mem,
                volumes=vols,
                restart_policy={"Name": "unless-stopped"},
            )
        except Exception as e:
            raise SidecarError(f"Failed to create sidecar container: {e}")

        internal_url = f"http://{container_name}:{SIDECAR_INTERNAL_PORT}/mcp"

        info = SidecarInfo(
            container_id=container.id,
            container_name=container_name,
            catalog_id=catalog_id,
            internal_url=internal_url,
            server_id=server_id,
        )
        self._sidecars[server_id] = info
        self._update_sidecar_gauge()

        logger.info(
            "Deployed MCP sidecar %s for %s → %s",
            container_name, entry.name, internal_url,
        )
        return info

    async def undeploy(self, server_id: str) -> bool:
        """Stop and remove a sidecar container."""
        info = self._sidecars.pop(server_id, None)
        if not info:
            return False

        try:
            docker_client = await self._get_docker()
            container = await asyncio.to_thread(
                docker_client.containers.get, info.container_id
            )
            await asyncio.to_thread(container.stop, timeout=10)
            await asyncio.to_thread(container.remove)
            logger.info("Removed MCP sidecar %s", info.container_name)
        except Exception as e:
            logger.warning("Error removing sidecar %s: %s", info.container_name, e)

        self._update_sidecar_gauge()
        return True

    async def get_sidecar_status(self, server_id: str) -> dict[str, Any] | None:
        """Get status of a sidecar container."""
        info = self._sidecars.get(server_id)
        if not info:
            return None

        try:
            docker_client = await self._get_docker()
            container = await asyncio.to_thread(
                docker_client.containers.get, info.container_id
            )
            return {
                "server_id": server_id,
                "container_id": info.container_id,
                "container_name": info.container_name,
                "catalog_id": info.catalog_id,
                "internal_url": info.internal_url,
                "status": container.status,
                "running": container.status == "running",
            }
        except Exception:
            return {
                "server_id": server_id,
                "container_name": info.container_name,
                "catalog_id": info.catalog_id,
                "status": "not_found",
                "running": False,
            }

    async def recover_sidecars(self) -> list[SidecarInfo]:
        """On startup, find existing sidecar containers and re-track them."""
        try:
            docker_client = await self._get_docker()
        except SidecarError:
            return []

        recovered = []
        try:
            containers = await asyncio.to_thread(
                docker_client.containers.list,
                filters={"label": f"{SIDECAR_LABEL_PREFIX}=true"},
                all=True,
            )
            for container in containers:
                labels = container.labels
                server_id = labels.get(f"{SIDECAR_LABEL_PREFIX}.server-id")
                catalog_id = labels.get(f"{SIDECAR_LABEL_PREFIX}.catalog-id")
                if not server_id or not catalog_id:
                    continue

                info = SidecarInfo(
                    container_id=container.id,
                    container_name=container.name,
                    catalog_id=catalog_id,
                    internal_url=f"http://{container.name}:{SIDECAR_INTERNAL_PORT}/mcp",
                    server_id=server_id,
                )
                self._sidecars[server_id] = info
                recovered.append(info)

                # Restart if stopped
                if container.status != "running":
                    try:
                        await asyncio.to_thread(container.start)
                        logger.info("Restarted sidecar %s", container.name)
                    except Exception as e:
                        logger.warning("Failed to restart %s: %s", container.name, e)

        except Exception as e:
            logger.warning("Failed to recover sidecars: %s", e)

        if recovered:
            logger.info("Recovered %d MCP sidecar(s)", len(recovered))
            self._update_sidecar_gauge()
        return recovered

    async def shutdown(self) -> None:
        """Stop all tracked sidecar containers (but don't remove them for recovery)."""
        for server_id in list(self._sidecars.keys()):
            info = self._sidecars.get(server_id)
            if not info:
                continue
            try:
                docker_client = await self._get_docker()
                container = await asyncio.to_thread(
                    docker_client.containers.get, info.container_id
                )
                await asyncio.to_thread(container.stop, timeout=10)
                logger.info("Stopped sidecar %s", info.container_name)
            except Exception:
                logger.warning("Failed to stop sidecar %s", info.container_name, exc_info=True)

    def _update_sidecar_gauge(self) -> None:
        """Update the Prometheus gauge for active sidecars."""
        try:
            from src.infra.metrics import mcp_sidecars_active
            mcp_sidecars_active.set(len(self._sidecars))
        except Exception:
            pass

    @property
    def tracked_sidecars(self) -> dict[str, SidecarInfo]:
        return dict(self._sidecars)
