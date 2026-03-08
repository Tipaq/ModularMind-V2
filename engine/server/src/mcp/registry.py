"""MCP server registry.

Manages MCP server configurations and client connections.
Provides tool resolution for the GraphCompiler.
Supports project scoping: servers with project_id=None are global.
"""

import asyncio
import json
import logging
import time
from pathlib import Path

from . import MCPClient, MCPClientError
from .schemas import MCPServerConfig, MCPServerStatus, MCPToolDefinition

logger = logging.getLogger(__name__)


class MCPRegistry:
    """Registry for MCP server connections.

    Manages server configs and lazy-initialized client connections.
    Configs are loaded from CONFIG_DIR/mcp/ as JSON files.

    Uses per-server asyncio locks for safe concurrent client creation
    and a tool cache with 60s TTL to avoid redundant network calls.
    """

    _TOOL_CACHE_TTL = 60.0

    def __init__(self, config_dir: str | None = None):
        self._servers: dict[str, MCPServerConfig] = {}
        self._clients: dict[str, MCPClient] = {}
        self._config_dir = Path(config_dir) / "mcp" if config_dir else None
        self._locks: dict[str, asyncio.Lock] = {}
        self._shutting_down: bool = False
        self._tool_cache: dict[str, list[MCPToolDefinition]] = {}
        self._tool_cache_ts: dict[str, float] = {}

    def _get_lock(self, server_id: str) -> asyncio.Lock:
        """Get or create a per-server asyncio lock (atomic via dict.setdefault)."""
        return self._locks.setdefault(server_id, asyncio.Lock())

    def load_from_disk(self) -> None:
        """Load MCP server configs from CONFIG_DIR/mcp/*.json."""
        if not self._config_dir or not self._config_dir.exists():
            return

        for path in self._config_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                config = MCPServerConfig(**data)
                self._servers[config.id] = config
                logger.info("Loaded MCP server config: %s (%s)", config.name, config.id)
            except Exception as e:
                logger.error("Failed to load MCP config %s: %s", path.name, e)

    def register(self, config: MCPServerConfig) -> None:
        """Register an MCP server configuration."""
        self._servers[config.id] = config
        # Invalidate existing client if config changed
        existing_client = self._clients.pop(config.id, None)
        if existing_client:
            asyncio.ensure_future(self._safe_disconnect(existing_client))
        # Invalidate cache and lock for re-registration
        self._tool_cache.pop(config.id, None)
        self._tool_cache_ts.pop(config.id, None)
        self._locks.pop(config.id, None)

    def unregister(self, server_id: str) -> bool:
        """Remove an MCP server. Returns True if it existed."""
        removed = server_id in self._servers
        self._servers.pop(server_id, None)
        client = self._clients.pop(server_id, None)
        if client:
            asyncio.ensure_future(self._safe_disconnect(client))
        self._tool_cache.pop(server_id, None)
        self._tool_cache_ts.pop(server_id, None)
        return removed

    def list_servers(self, project_id: str | None = None) -> list[MCPServerConfig]:
        """List MCP servers, optionally filtered by project.

        Returns servers that match project_id OR have project_id=None (global).
        If project_id filter is None, returns all servers.
        """
        if project_id is None:
            return list(self._servers.values())
        return [
            s for s in self._servers.values() if s.project_id is None or s.project_id == project_id
        ]

    def get_server(self, server_id: str) -> MCPServerConfig | None:
        """Get a server config by ID."""
        return self._servers.get(server_id)

    async def get_client(self, server_id: str) -> MCPClient:
        """Get or create an MCP client for a server.

        Uses double-checked locking with per-server asyncio locks to prevent
        duplicate connections from concurrent calls.
        """
        # Fast path: no lock needed if client is healthy
        if server_id in self._clients:
            client = self._clients[server_id]
            if client.is_healthy:
                return client

        # Slow path: acquire per-server lock
        async with self._get_lock(server_id):
            # Double-check after acquiring lock
            if server_id in self._clients:
                client = self._clients[server_id]
                if client.is_healthy:
                    return client
                # Unhealthy — purge and reconnect
                logger.warning("Purging unhealthy MCP client for '%s'", server_id)
                await self._safe_disconnect(client)
                del self._clients[server_id]

            config = self._servers.get(server_id)
            if not config:
                raise MCPClientError(f"MCP server '{server_id}' not registered")
            if not config.enabled:
                raise MCPClientError(f"MCP server '{config.name}' is disabled")

            # Resolve secrets for STDIO configs (env stays empty on disk)
            from .schemas import MCPTransport

            if config.transport == MCPTransport.STDIO and not config.env:
                from src.infra.secrets import secrets_store

                resolved_env = {}
                prefix = f"MCP_{config.id}_"
                for key in secrets_store.list_keys(prefix):
                    env_key = key.removeprefix(prefix)
                    resolved_env[env_key] = secrets_store.get(key)
                if resolved_env:
                    config = config.model_copy(update={"env": resolved_env})

            client = MCPClient(config)
            await client.connect()
            self._clients[server_id] = client
            return client

    async def discover_tools(self, server_id: str) -> list[MCPToolDefinition]:
        """Discover tools from a specific MCP server (cached with 60s TTL)."""
        cached_ts = self._tool_cache_ts.get(server_id)
        if cached_ts is not None and (time.monotonic() - cached_ts) < self._TOOL_CACHE_TTL:
            return self._tool_cache[server_id]

        client = await self.get_client(server_id)
        tools = await client.list_tools()
        self._tool_cache[server_id] = tools
        self._tool_cache_ts[server_id] = time.monotonic()
        return tools

    async def discover_all_tools(
        self, project_id: str | None = None
    ) -> dict[str, list[MCPToolDefinition]]:
        """Discover tools from all enabled MCP servers (parallelized)."""
        servers = self.list_servers(project_id)
        enabled = [s for s in servers if s.enabled]

        async def _discover(server: MCPServerConfig) -> tuple[str, list[MCPToolDefinition]]:
            try:
                tools = await self.discover_tools(server.id)
                return server.id, tools
            except MCPClientError as e:
                logger.warning("Failed to discover tools from %s: %s", server.name, e)
                return server.id, []

        results = await asyncio.gather(*[_discover(s) for s in enabled])
        return dict(results)

    async def get_server_status(self, server_id: str) -> MCPServerStatus:
        """Get status of a specific MCP server.

        Attempts to connect enabled servers that have no client yet,
        and discovers tools for connected servers with empty caches.
        """
        config = self._servers.get(server_id)
        if not config:
            return MCPServerStatus(
                server_id=server_id,
                name="unknown",
                connected=False,
                error="Server not registered",
            )

        client = self._clients.get(server_id)
        error: str | None = None

        # If enabled server has no client yet, attempt to connect
        if not client and config.enabled and (config.url or config.command):
            try:
                client = await self.get_client(server_id)
            except Exception as e:
                error = str(e)

        connected = client.is_connected if client else False
        if not error and client and not client.is_healthy:
            error = "Unhealthy (consecutive failures)"

        # Use client cached tools first, fall back to registry-level cache
        tools_count = len(client.get_cached_tools()) if client else 0
        if tools_count == 0 and server_id in self._tool_cache:
            tools_count = len(self._tool_cache[server_id])

        # If connected but no tools discovered yet, trigger discovery
        if connected and tools_count == 0 and client:
            try:
                tools = await client.list_tools()
                tools_count = len(tools)
                self._tool_cache[server_id] = tools
                self._tool_cache_ts[server_id] = time.monotonic()
            except Exception:
                logger.debug(
                    "Tool discovery for %s failed, will retry",
                    server_id,
                    exc_info=True,
                )

        return MCPServerStatus(
            server_id=server_id,
            name=config.name,
            connected=connected,
            tools_count=tools_count,
            error=error,
        )

    async def get_all_statuses(self) -> list[MCPServerStatus]:
        """Get status of all registered MCP servers (parallelized)."""
        tasks = [self.get_server_status(sid) for sid in self._servers]
        return list(await asyncio.gather(*tasks))

    def persist_config(self, config: MCPServerConfig) -> None:
        """Save an MCP server config to disk."""
        if not self._config_dir:
            logger.warning("No config_dir set, cannot persist MCP config")
            return
        self._config_dir.mkdir(parents=True, exist_ok=True)
        path = self._config_dir / f"{config.id}.json"
        path.write_text(config.model_dump_json(indent=2))

    def delete_config(self, server_id: str) -> None:
        """Delete an MCP server config file from disk."""
        if not self._config_dir:
            return
        path = self._config_dir / f"{server_id}.json"
        if path.exists():
            path.unlink()

    async def shutdown(self) -> None:
        """Disconnect all clients. Call on application shutdown.

        Drains in-flight operations by acquiring each lock with a 5s timeout,
        then disconnects all clients and clears state.
        """
        self._shutting_down = True

        # Drain in-flight operations (e.g. slow connect() calls)
        for lock in list(self._locks.values()):
            try:
                async with asyncio.timeout(5.0):
                    async with lock:
                        pass  # Acquire + release ensures holder finished
            except TimeoutError:
                logger.warning("Lock drain timed out during shutdown")

        self._locks.clear()

        tasks = [self._safe_disconnect(c) for c in self._clients.values()]
        if tasks:
            await asyncio.gather(*tasks)
        self._clients.clear()
        self._tool_cache.clear()
        self._tool_cache_ts.clear()

    @staticmethod
    async def _safe_disconnect(client: MCPClient) -> None:
        """Disconnect a client, swallowing errors."""
        try:
            await client.disconnect()
        except Exception as e:
            logger.warning("Error disconnecting MCP client: %s", e)
