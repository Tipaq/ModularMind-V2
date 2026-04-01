"""MCP client using the official mcp SDK.

Wraps the mcp Python SDK (v1.26.0+). Supports both Streamable HTTP and stdio
transports via AsyncExitStack for long-lived context managers.
"""

import contextlib
import logging
from typing import Any

import httpx
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

from mcp import ClientSession, StdioServerParameters

from .schemas import (
    MCPServerConfig,
    MCPToolCallRequest,
    MCPToolCallResult,
    MCPToolDefinition,
    MCPTransport,
)

logger = logging.getLogger(__name__)

_MAX_RETRIES = 1


class MCPClientError(Exception):
    """Base exception for MCP client errors."""


class MCPConnectionError(MCPClientError):
    """Failed to connect to MCP server."""


class MCPToolError(MCPClientError):
    """Error executing an MCP tool."""


class MCPClient:
    """Async MCP client using the official mcp SDK.

    Supports both Streamable HTTP and stdio transports.
    Uses AsyncExitStack to keep SDK context managers alive for
    the registry's lazy-init pattern.
    """

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self._session: ClientSession | None = None
        self._exit_stack: contextlib.AsyncExitStack | None = None
        self._tools: list[MCPToolDefinition] = []
        self._initialized = False
        self._consecutive_failures = 0

    @property
    def is_connected(self) -> bool:
        return self._initialized and self._session is not None

    @property
    def is_healthy(self) -> bool:
        return self.is_connected and self._consecutive_failures < 3

    async def connect(self) -> None:
        """Initialize connection to the MCP server."""
        if self.config.transport == MCPTransport.STDIO:
            if not self.config.command:
                raise MCPConnectionError(
                    f"No command configured for stdio server '{self.config.id}'"
                )
            await self._connect_stdio()
        else:
            if not self.config.url:
                raise MCPConnectionError(f"No URL configured for server '{self.config.id}'")
            await self._connect_http()

    async def _connect_http(self) -> None:
        """Connect via Streamable HTTP transport."""
        try:
            self._exit_stack = contextlib.AsyncExitStack()

            # Create custom httpx client if headers are needed
            http_client = None
            if self.config.headers:
                http_client = httpx.AsyncClient(
                    headers=self.config.headers,
                    timeout=httpx.Timeout(self.config.timeout_seconds),
                )

            transport_ctx = streamable_http_client(
                self.config.url,
                http_client=http_client,
            )
            read, write, _ = await self._exit_stack.enter_async_context(transport_ctx)

            session = ClientSession(read, write)
            self._session = await self._exit_stack.enter_async_context(session)
            await self._session.initialize()

            self._initialized = True
            self._consecutive_failures = 0
            logger.info("MCP SDK client connected to '%s' (HTTP)", self.config.name)

        except (httpx.HTTPError, OSError, ConnectionError, TimeoutError) as e:
            await self._cleanup()
            raise MCPConnectionError(
                f"Failed to connect to MCP server '{self.config.name}': {e}"
            ) from e

    async def _connect_stdio(self) -> None:
        """Connect via stdio transport (subprocess)."""
        try:
            self._exit_stack = contextlib.AsyncExitStack()

            params = StdioServerParameters(
                command=self.config.command,
                args=self.config.args,
                env=self.config.env or None,
            )
            transport_ctx = stdio_client(params)
            read, write = await self._exit_stack.enter_async_context(transport_ctx)

            session = ClientSession(read, write)
            self._session = await self._exit_stack.enter_async_context(session)
            await self._session.initialize()

            self._initialized = True
            self._consecutive_failures = 0
            logger.info("MCP SDK client connected to '%s' (stdio)", self.config.name)

        except (OSError, ConnectionError, TimeoutError, RuntimeError) as e:
            await self._cleanup()
            raise MCPConnectionError(
                f"Failed to connect to MCP server '{self.config.name}': {e}"
            ) from e

    async def disconnect(self) -> None:
        """Close the connection and tear down the AsyncExitStack."""
        await self._cleanup()
        self._initialized = False
        self._tools = []

    async def list_tools(self) -> list[MCPToolDefinition]:
        """Discover available tools from the MCP server."""
        result = await self._call_with_retry(self._list_tools_inner)
        return result

    async def _list_tools_inner(self) -> list[MCPToolDefinition]:
        result = await self._session.list_tools()
        self._tools = [
            MCPToolDefinition(
                name=tool.name,
                description=tool.description,
                input_schema=tool.inputSchema or {},
            )
            for tool in result.tools
        ]
        logger.info(
            "Discovered %d tools from MCP server '%s'",
            len(self._tools),
            self.config.name,
        )
        return self._tools

    async def call_tool(self, request: MCPToolCallRequest) -> MCPToolCallResult:
        """Execute a tool on the MCP server."""
        return await self._call_with_retry(self._call_tool_inner, request)

    async def _call_tool_inner(self, request: MCPToolCallRequest) -> MCPToolCallResult:
        result = await self._session.call_tool(request.tool_name, request.arguments)

        if getattr(result, "isError", None) or getattr(result, "is_error", None):
            raise MCPToolError(f"Tool '{request.tool_name}' on '{self.config.name}' returned error")

        content = [
            {"type": "text", "text": item.text} for item in result.content if hasattr(item, "text")
        ]
        return MCPToolCallResult(content=content, is_error=False)

    async def health_check(self) -> bool:
        """Check if the MCP server is reachable via ping."""
        try:
            if not self.is_connected:
                await self.connect()
            await self._session.send_ping()
            return True
        except (MCPClientError, OSError, ConnectionError, TimeoutError):
            return False

    def get_cached_tools(self) -> list[MCPToolDefinition]:
        """Return previously discovered tools without re-fetching."""
        return list(self._tools)

    # --- Internal ---

    async def _call_with_retry(self, fn, *args) -> Any:
        """Call a function with auto-reconnect on failure (1 retry)."""
        if not self.is_connected:
            raise MCPConnectionError(
                f"MCP client not connected to '{self.config.name}'. Call connect() first."
            )

        for attempt in range(_MAX_RETRIES + 1):
            try:
                result = await fn(*args)
                self._consecutive_failures = 0
                return result
            except MCPToolError:
                raise
            except (OSError, ConnectionError, TimeoutError, RuntimeError) as e:
                self._consecutive_failures += 1
                if attempt < _MAX_RETRIES:
                    logger.warning(
                        "MCP request to '%s' failed (attempt %d), reconnecting: %s",
                        self.config.name,
                        attempt + 1,
                        e,
                    )
                    await self.disconnect()
                    await self.connect()
                else:
                    raise MCPConnectionError(
                        f"MCP request to '{self.config.name}' failed "
                        f"after {_MAX_RETRIES + 1} attempts: {e}"
                    ) from e

        raise MCPConnectionError("Unexpected retry exhaustion")

    async def _cleanup(self) -> None:
        """Close the exit stack if open."""
        if self._exit_stack:
            try:
                await self._exit_stack.aclose()
            except (OSError, RuntimeError) as e:
                logger.warning("Error closing MCP exit stack: %s", e)
            self._exit_stack = None
        self._session = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *exc):
        await self.disconnect()
