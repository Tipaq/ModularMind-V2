"""MCP service — registry singleton, sidecar manager, and lifecycle management.

Note: The Celery worker runs in a separate process and will create its own
registry instance. Both API and worker processes load from the same disk storage.
The sidecar manager is only active in the API process (not Celery workers).
"""

import fcntl
import logging
import uuid
from pathlib import Path

from src.mcp import MCPRegistry

from src.infra.config import get_settings

logger = logging.getLogger(__name__)

_registry: MCPRegistry | None = None
_sidecar_manager = None  # Lazy import to avoid docker dependency in workers


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
    Requires Docker to be available — silently skips otherwise.

    Uses a file lock to prevent duplicate deploys when multiple Uvicorn
    workers start concurrently.
    """
    from src.mcp.catalog import get_free_catalog_entries
    from src.mcp.schemas import MCPServerConfig, MCPTransport

    manager = get_sidecar_manager()
    if not manager.is_available:
        logger.debug("Docker not available — skipping free MCP auto-deploy")
        return

    settings = get_settings()
    lock_path = Path(settings.CONFIG_DIR) / "mcp" / ".auto-deploy.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    lock_fd = open(lock_path, "w")
    try:
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

        for entry in free_entries:
            if entry.id in existing_catalog_ids:
                logger.debug("MCP auto-deploy: %s already registered, skipping", entry.name)
                continue

            server_id = str(uuid.uuid4())
            try:
                info = await manager.deploy(
                    catalog_id=entry.id,
                    secrets={},
                    server_id=server_id,
                )
            except Exception as e:
                logger.warning("MCP auto-deploy: failed to deploy %s: %s", entry.name, e)
                continue

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
            registry.register(config)
            registry.persist_config(config)
            deployed += 1
            logger.info(
                "MCP auto-deploy: deployed '%s' → %s (id=%s)",
                entry.name, info.internal_url, server_id,
            )

        if deployed:
            logger.info("MCP auto-deploy: %d credential-free server(s) deployed", deployed)
    finally:
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


async def _warm_mcp_clients() -> None:
    """Connect to all enabled MCP servers in the background.

    Waits a few seconds for sidecars to be fully ready, then attempts
    connection with one retry.  Failures are non-fatal — clients will
    reconnect lazily when actually used.
    """
    import asyncio
    from src.mcp.client import MCPClientError

    registry = get_mcp_registry()
    servers = [s for s in registry.list_servers() if s.enabled]
    if not servers:
        return

    # Give sidecars time to finish starting — npm-based servers need
    # to download packages on first run which can take 15-30 seconds.
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


async def shutdown_mcp() -> None:
    """Shutdown hook — disconnect all MCP clients."""
    global _registry, _sidecar_manager
    if _registry:
        await _registry.shutdown()
        _registry = None
    if _sidecar_manager:
        await _sidecar_manager.shutdown()
        _sidecar_manager = None
