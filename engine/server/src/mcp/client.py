"""MCP client for Streamable HTTP transport.

Implements the client side of the Model Context Protocol:
- Initialize handshake (JSON-RPC 2.0 over HTTP POST)
- Tool listing (tools/list)
- Tool calling (tools/call)
- Auto-reconnect on connection failure (1 retry)

Note: SSE streaming responses are deferred — this implementation handles
application/json responses only. The Content-Type check is in place for
future SSE support.
"""

import itertools
import json
import logging
from typing import Any

import httpx

from .schemas import (
    MCPServerConfig,
    MCPToolCallRequest,
    MCPToolCallResult,
    MCPToolDefinition,
)

logger = logging.getLogger(__name__)

MCP_PROTOCOL_VERSION = "2024-11-05"
_MAX_RETRIES = 1


class MCPClientError(Exception):
    """Base exception for MCP client errors."""


class MCPConnectionError(MCPClientError):
    """Failed to connect to MCP server."""


class MCPToolError(MCPClientError):
    """Error executing an MCP tool."""


class MCPClient:
    """Async MCP client for MCP Streamable HTTP transport.

    Handles:
    - Connection lifecycle (initialize, close)
    - Tool discovery (tools/list)
    - Tool execution (tools/call)
    - Auto-reconnect on transient failures (1 retry)
    """

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self._http: httpx.AsyncClient | None = None
        self._tools: list[MCPToolDefinition] = []
        self._initialized = False
        self._consecutive_failures = 0
        self._id_counter = itertools.count(1)
        self._session_id: str | None = None

    @property
    def is_connected(self) -> bool:
        """Whether the client has an active connection."""
        return self._initialized and self._http is not None

    @property
    def is_healthy(self) -> bool:
        """Whether the client is connected and not in a failure state."""
        return self.is_connected and self._consecutive_failures < 3

    async def connect(self) -> None:
        """Initialize connection to the MCP server."""
        if not self.config.url:
            raise MCPConnectionError(f"No URL configured for server '{self.config.id}'")

        headers = {
            **self.config.headers,
            "Accept": "application/json, text/event-stream",
        }

        self._http = httpx.AsyncClient(
            base_url=self.config.url,
            headers=headers,
            timeout=httpx.Timeout(self.config.timeout_seconds),
        )

        try:
            init_response = await self._send_jsonrpc("initialize", {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "clientInfo": {
                    "name": "modularmind-runtime",
                    "version": "0.1.0",
                },
            })

            if "error" in init_response:
                await self._cleanup_http()
                raise MCPConnectionError(
                    f"MCP init failed for '{self.config.name}': {init_response['error']}"
                )

            # Session ID is extracted from response headers in _send_jsonrpc()
            # (Streamable HTTP servers include Mcp-Session-Id header)

            # Send initialized notification
            await self._send_jsonrpc_notification("notifications/initialized", {})
            self._initialized = True
            self._consecutive_failures = 0
            logger.info("MCP client connected to '%s'", self.config.name)

        except httpx.HTTPError as e:
            await self._cleanup_http()
            raise MCPConnectionError(
                f"Failed to connect to MCP server '{self.config.name}': {e}"
            ) from e

    async def disconnect(self) -> None:
        """Close the connection."""
        await self._cleanup_http()
        self._initialized = False
        self._tools = []
        self._session_id = None

    async def list_tools(self) -> list[MCPToolDefinition]:
        """Discover available tools from the MCP server."""
        response = await self._send_with_retry("tools/list", {})
        raw_tools = response.get("result", {}).get("tools", [])

        self._tools = [
            MCPToolDefinition(
                name=t["name"],
                description=t.get("description"),
                input_schema=t.get("inputSchema", {}),
            )
            for t in raw_tools
        ]

        logger.info(
            "Discovered %d tools from MCP server '%s'",
            len(self._tools), self.config.name,
        )
        return self._tools

    async def call_tool(self, request: MCPToolCallRequest) -> MCPToolCallResult:
        """Execute a tool on the MCP server."""
        response = await self._send_with_retry("tools/call", {
            "name": request.tool_name,
            "arguments": request.arguments,
        })

        if "error" in response:
            error = response["error"]
            raise MCPToolError(
                f"Tool '{request.tool_name}' on '{self.config.name}' failed: "
                f"{error.get('message', str(error))}"
            )

        result = response.get("result", {})
        return MCPToolCallResult(
            content=result.get("content", []),
            is_error=result.get("isError", False),
        )

    async def health_check(self) -> bool:
        """Check if the MCP server is reachable via lightweight ping."""
        try:
            if not self.is_connected:
                await self.connect()
            await self._send_jsonrpc("ping", {})
            # Any response (success or JSON-RPC error) means server is reachable
            return True
        except httpx.HTTPStatusError:
            # Server responded with 4xx/5xx — still reachable
            return True
        except (httpx.ConnectError, httpx.TimeoutException, MCPConnectionError):
            # Transport/connection error — server unreachable
            return False
        except Exception:
            # Unknown error — conservative, mark unhealthy
            return False

    def get_cached_tools(self) -> list[MCPToolDefinition]:
        """Return previously discovered tools without re-fetching."""
        return list(self._tools)

    # --- Internal ---

    async def _send_with_retry(self, method: str, params: dict[str, Any]) -> dict:
        """Send JSON-RPC with auto-reconnect on failure (1 retry)."""
        if not self.is_connected:
            raise MCPConnectionError(
                f"MCP client not connected to '{self.config.name}'. Call connect() first."
            )

        for attempt in range(_MAX_RETRIES + 1):
            try:
                result = await self._send_jsonrpc(method, params)
                self._consecutive_failures = 0
                return result
            except (httpx.HTTPError, MCPConnectionError) as e:
                self._consecutive_failures += 1
                if attempt < _MAX_RETRIES:
                    logger.warning(
                        "MCP request to '%s' failed (attempt %d), reconnecting: %s",
                        self.config.name, attempt + 1, e,
                    )
                    await self.disconnect()
                    await self.connect()
                else:
                    raise MCPConnectionError(
                        f"MCP request to '{self.config.name}' failed after {_MAX_RETRIES + 1} attempts: {e}"
                    ) from e

        # Unreachable but satisfies type checker
        raise MCPConnectionError("Unexpected retry exhaustion")

    async def _send_jsonrpc(self, method: str, params: dict[str, Any]) -> dict:
        """Send a JSON-RPC 2.0 request and return the response."""
        msg_id = next(self._id_counter)
        payload = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method,
            "params": params,
        }

        headers = {}
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id

        response = await self._http.post("", json=payload, headers=headers)
        response.raise_for_status()

        # Store session ID from response if present
        if "mcp-session-id" in response.headers:
            self._session_id = response.headers["mcp-session-id"]

        content_type = response.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            return self._parse_sse_response(response.text, msg_id)

        return response.json()

    async def _send_jsonrpc_notification(self, method: str, params: dict[str, Any]) -> None:
        """Send a JSON-RPC notification (no id, no response expected)."""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        headers = {}
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        await self._http.post("", json=payload, headers=headers)

    @staticmethod
    def _parse_sse_response(text: str, expected_id: int) -> dict:
        """Extract a JSON-RPC response from an SSE event stream.

        MCP servers behind SSE proxies (like mcp-proxy) return responses as
        text/event-stream with ``data:`` lines containing JSON-RPC messages.
        We scan all ``data:`` lines for the response matching our request id.
        """
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("data:"):
                continue
            raw = stripped[len("data:"):].strip()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                continue
            # Match by id (could be int or str depending on proxy)
            if parsed.get("id") == expected_id or str(parsed.get("id")) == str(expected_id):
                return parsed
            # Also accept responses without an id (some proxies omit it)
            if "result" in parsed or "error" in parsed:
                return parsed
        # Fallback: no matching JSON-RPC response found in stream
        return {"error": {"code": -1, "message": "No JSON-RPC response found in SSE stream"}}

    async def _cleanup_http(self) -> None:
        """Close the HTTP client if open."""
        if self._http:
            await self._http.aclose()
            self._http = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *exc):
        await self.disconnect()
