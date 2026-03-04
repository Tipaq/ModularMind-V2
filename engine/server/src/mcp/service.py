"""MCP service — registry singleton, sidecar manager, and lifecycle management.

Note: The Redis Streams worker runs in a separate process and will create its own
registry instance. Both API and worker processes load from the same disk storage.
The sidecar manager is only active in the API process (not worker processes).
"""

import asyncio
import logging
import sys
import uuid
from pathlib import Path

from src.infra.config import get_settings
from src.mcp import MCPRegistry

logger = logging.getLogger(__name__)

_registry: MCPRegistry | None = None
_sidecar_manager = None  # Lazy import to avoid docker dependency in workers
_health_task: asyncio.Task | None = None


def get_mcp_registry() -> MCPRegistry:
    """Get or create the global MCP registry (per-process singleton)."""
    global _registry
    if _registry is None:
        settings = get_settings()
        _registry = MCPRegistry(config_dir=settings.CONFIG_DIR)
        _registry.load_from_disk()
        logger.info("MCP registry initialized from %s/mcp/", settings.CONFIG_DIR)
    return _registry


def get_sidecar_manager():
    """Get or create the sidecar manager (API process only)."""
    global _sidecar_manager
    if _sidecar_manager is None:
        from src.mcp.sidecar import SidecarManager
        _sidecar_manager = SidecarManager()
    return _sidecar_manager


def _bootstrap_mcp_servers() -> None:
    """Auto-register MCP servers from MCP_BOOTSTRAP_SERVERS env var.

    Format: "Name|URL,Name2|URL2"
    Servers already registered at the same URL are skipped.
    """
    settings = get_settings()
    raw = settings.MCP_BOOTSTRAP_SERVERS.strip()
    if not raw:
        return

    from src.mcp.schemas import MCPServerConfig, MCPTransport

    registry = get_mcp_registry()
    existing_urls = {s.url for s in registry.list_servers() if s.url}

    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split("|", 1)
        if len(parts) != 2:
            logger.warning("Invalid MCP_BOOTSTRAP_SERVERS entry (expected 'Name|URL'): %s", entry)
            continue

        name, url = parts[0].strip(), parts[1].strip()
        if url in existing_urls:
            logger.debug("MCP bootstrap: %s already registered, skipping", name)
            continue

        server_id = str(uuid.uuid4())
        config = MCPServerConfig(
            id=server_id,
            name=name,
            transport=MCPTransport.HTTP,
            url=url,
            enabled=True,
            managed=True,  # Trusted Docker-internal URL — skip SSRF validation
        )
        registry.register(config)
        registry.persist_config(config)
        logger.info("MCP bootstrap: registered '%s' at %s (id=%s)", name, url, server_id)


async def _auto_deploy_free_catalog_entries() -> None:
    """Deploy catalog entries that require no credentials.

    Skips entries that are already registered (matched by catalog_id).
    Supports hybrid deployment: Docker sidecar for entries with docker_image,
    subprocess via stdio_client for npm-only entries.

    Uses a file lock to prevent duplicate deploys when multiple Uvicorn
    workers start concurrently.
    """
    import shutil

    from src.mcp.catalog import get_free_catalog_entries
    from src.mcp.schemas import MCPServerConfig, MCPTransport

    manager = get_sidecar_manager()
    has_docker = manager.is_available
    has_npx = shutil.which("npx") is not None

    if not has_docker and not has_npx:
        logger.info("MCP auto-deploy: neither Docker nor npx available, skipping")
        return

    settings = get_settings()
    lock_path = Path(settings.CONFIG_DIR) / "mcp" / ".auto-deploy.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    lock_fd = open(lock_path, "w")
    try:
        if sys.platform == "win32":
            import msvcrt
            msvcrt.locking(lock_fd.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        logger.debug("MCP auto-deploy: another worker holds the lock, skipping")
        lock_fd.close()
        return

    try:
        # Re-load registry from disk inside the lock to see configs written
        # by previous startup attempts.
        registry = get_mcp_registry()
        registry.load_from_disk()

        existing_catalog_ids = {
            s.catalog_id for s in registry.list_servers() if s.catalog_id
        }

        free_entries = get_free_catalog_entries()
        deployed = 0

        logger.info(
            "MCP auto-deploy: docker=%s, npx=%s, %d free entries",
            has_docker, has_npx, len(free_entries),
        )

        for entry in free_entries:
            if entry.id in existing_catalog_ids:
                logger.debug("MCP auto-deploy: %s already registered, skipping", entry.name)
                continue

            server_id = str(uuid.uuid4())
            try:
                if entry.docker_image and has_docker:
                    # Docker sidecar path
                    info = await manager.deploy(
                        catalog_id=entry.id,
                        secrets={},
                        server_id=server_id,
                    )
                    config = MCPServerConfig(
                        id=server_id,
                        name=entry.name,
                        description=entry.description,
                        transport=MCPTransport.HTTP,
                        url=info.internal_url,
                        enabled=True,
                        managed=True,
                        catalog_id=entry.id,
                    )
                elif entry.npm_package and not entry.docker_image and has_npx:
                    # Subprocess path
                    config = MCPServerConfig(
                        id=server_id,
                        name=entry.name,
                        description=entry.description,
                        transport=MCPTransport.STDIO,
                        command="npx",
                        args=["-y", entry.npm_package],
                        enabled=True,
                        managed=True,
                        catalog_id=entry.id,
                    )
                else:
                    logger.info(
                        "MCP auto-deploy: skipping '%s' "
                        "(docker_image=%s docker=%s, npm=%s npx=%s)",
                        entry.name, bool(entry.docker_image), has_docker,
                        bool(entry.npm_package), has_npx,
                    )
                    continue

                registry.register(config)
                registry.persist_config(config)
                deployed += 1
                logger.info(
                    "MCP auto-deploy: deployed '%s' (%s)",
                    entry.name, config.transport.value,
                )
            except Exception as e:
                logger.warning("MCP auto-deploy: failed to deploy %s: %s", entry.name, e)
                continue

        if deployed:
            logger.info("MCP auto-deploy: %d credential-free server(s) deployed", deployed)
    finally:
        if sys.platform == "win32":
            import msvcrt
            try:
                msvcrt.locking(lock_fd.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()


async def startup_mcp(*, leader_only: bool = False) -> None:
    """Startup hook — recover sidecars, bootstrap, warm-up, and auto-deploy.

    Called in two phases from the lifespan handler:
      1. ``startup_mcp()``  — ALL workers: recover sidecars + bootstrap + warm-up
      2. ``startup_mcp(leader_only=True)`` — leader only: auto-deploy new MCPs

    Splitting this ensures MCP servers appear "Online" in the dashboard even
    when the current process lost the leader election (e.g. stale Redis lock
    after a container restart).
    """
    if leader_only:
        # Phase 2: auto-deploy credential-free catalog entries (leader only)
        settings = get_settings()
        if settings.MCP_AUTO_DEPLOY_FREE:
            try:
                await _auto_deploy_free_catalog_entries()
            except Exception as e:
                logger.warning("MCP free auto-deploy failed (non-fatal): %s", e)
        return

    # Phase 1: recover + bootstrap + warm-up (all workers)
    manager = get_sidecar_manager()
    if manager.is_available:
        try:
            recovered = await manager.recover_sidecars()
            if recovered:
                logger.info("Recovered %d MCP sidecar(s) from previous run", len(recovered))
        except Exception as e:
            logger.warning("MCP sidecar recovery failed (Docker may not be available): %s", e)
    else:
        logger.info("Docker SDK not available — MCP sidecar auto-provisioning disabled")

    # Auto-register MCP servers from environment
    try:
        _bootstrap_mcp_servers()
    except Exception as e:
        logger.warning("MCP bootstrap failed (non-fatal): %s", e)

    # Eagerly connect to all enabled MCP servers so the dashboard shows
    # them as "Online" immediately rather than waiting for first use.
    await _warm_mcp_clients()

    # Start health check loop (API process only)
    global _health_task
    _health_task = asyncio.create_task(_mcp_health_loop())


async def _warm_mcp_clients() -> None:
    """Connect to all enabled MCP servers in the background.

    Waits a few seconds for HTTP sidecars to be fully ready, then attempts
    connection with retries.  Failures are non-fatal — clients will
    reconnect lazily when actually used.
    """
    from src.mcp import MCPClientError
    from src.mcp.schemas import MCPTransport

    registry = get_mcp_registry()
    servers = [s for s in registry.list_servers() if s.enabled]
    if not servers:
        return

    # Only delay for HTTP servers (Docker sidecars need startup time).
    # STDIO servers start on-demand via subprocess — no wait needed.
    has_http = any(s.transport == MCPTransport.HTTP for s in servers)
    if has_http:
        await asyncio.sleep(10)

    async def _try_connect(server_id: str, name: str) -> None:
        for attempt in range(3):
            try:
                await registry.get_client(server_id)
                logger.info("MCP warm-up: connected to '%s'", name)
                return
            except MCPClientError as e:
                if attempt < 2:
                    await asyncio.sleep(5)
                else:
                    logger.warning("MCP warm-up: could not connect to '%s': %s", name, e)

    await asyncio.gather(*[_try_connect(s.id, s.name) for s in servers])
    connected = sum(1 for s in servers if registry._clients.get(s.id))
    if connected:
        logger.info("MCP warm-up: %d/%d server(s) connected", connected, len(servers))


async def _mcp_health_loop() -> None:
    """Background health-check loop for connected MCP servers.

    Pings each connected client every 60 seconds. Disconnects are
    handled lazily by the registry on next access. Runs only in the
    API process (MCP clients are not shared with the worker process).
    """
    while True:
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            return

        registry = get_mcp_registry()
        for server_id, client in list(registry._clients.items()):
            try:
                healthy = await client.health_check()
                if not healthy:
                    logger.warning("MCP health: '%s' ping failed", server_id)
            except Exception as e:
                logger.warning("MCP health: error checking '%s': %s", server_id, e)


async def shutdown_mcp() -> None:
    """Shutdown hook — cancel health loop and disconnect all MCP clients."""
    global _registry, _sidecar_manager, _health_task
    if _health_task:
        _health_task.cancel()
        try:
            await _health_task
        except asyncio.CancelledError:
            pass
        _health_task = None
    if _registry:
        await _registry.shutdown()
        _registry = None
    if _sidecar_manager:
        await _sidecar_manager.shutdown()
        _sidecar_manager = None
