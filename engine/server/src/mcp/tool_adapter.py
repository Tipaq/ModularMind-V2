"""MCP-to-LangChain tool adapter.

Bridges MCP tool definitions to LangChain's ``bind_tools()`` format and
provides an executor that dispatches tool calls to the correct MCP server.

Tool names are **namespaced** as ``{short_server_id}__{tool_name}`` so that
multiple MCP servers can expose tools with the same name without collision.
"""

import asyncio
import logging
import time
from typing import Any

from .registry import MCPRegistry
from .schemas import MCPToolCallRequest, MCPToolDefinition
from .sdk_client import MCPClientError

logger = logging.getLogger(__name__)


class _TokenBucket:
    """Simple token-bucket rate limiter keyed by server_id.

    Shared across all tool calls. Default: 30 calls/min per server.
    """

    def __init__(self, rate: float = 30.0, period: float = 60.0):
        self._rate = rate
        self._period = period
        self._buckets: dict[str, tuple[float, float]] = {}  # key → (tokens, last_ts)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        tokens, last_ts = self._buckets.get(key, (self._rate, now))
        elapsed = now - last_ts
        tokens = min(self._rate, tokens + elapsed * (self._rate / self._period))
        if tokens >= 1.0:
            self._buckets[key] = (tokens - 1.0, now)
            return True
        self._buckets[key] = (tokens, now)
        return False


_mcp_tool_bucket = _TokenBucket()


class MCPToolExecutor:
    """Executes MCP tools by namespaced name.

    Maps ``short_server_id__tool_name`` → ``(full_server_id, tool_name)``
    for O(1) dispatch to the correct MCP server via the registry.
    """

    def __init__(
        self,
        registry: MCPRegistry,
        server_tool_map: dict[str, tuple[str, str]],
    ):
        self.registry = registry
        self._map = server_tool_map

    async def execute(self, namespaced_name: str, arguments: dict[str, Any]) -> str:
        """Execute a tool by its namespaced name.

        Args:
            namespaced_name: ``short_id__tool_name`` as bound to the LLM.
            arguments: Tool arguments from the LLM's tool_call.

        Returns:
            Concatenated text content from the MCP result.

        Raises:
            MCPClientError: If the tool is unknown or the MCP call fails.
        """
        mapping = self._map.get(namespaced_name)
        if not mapping:
            raise MCPClientError(
                f"Unknown tool '{namespaced_name}'. Available: {list(self._map.keys())}"
            )

        server_id, real_name = mapping

        if not _mcp_tool_bucket.allow(server_id):
            raise MCPClientError(
                f"Rate limit exceeded for MCP server '{server_id}'. Try again shortly."
            )

        client = await self.registry.get_client(server_id)
        result = await client.call_tool(
            MCPToolCallRequest(
                server_id=server_id,
                tool_name=real_name,
                arguments=arguments,
            )
        )

        if result.is_error:
            error_texts = [c.get("text", "") for c in result.content if c.get("type") == "text"]
            raise MCPClientError(
                f"Tool '{real_name}' returned error: "
                + ("\n".join(error_texts) or str(result.content))
            )

        # Extract text content from the response items
        texts = [c["text"] for c in result.content if c.get("type") == "text"]
        return "\n".join(texts) if texts else str(result.content)


def _namespace_tool_name(server_id: str, tool_name: str) -> str:
    """Create a namespaced tool name: ``short_id__tool_name``."""
    short_id = server_id[:8]
    return f"{short_id}__{tool_name}"


def _tool_to_langchain_dict(ns_name: str, tool: MCPToolDefinition) -> dict[str, Any]:
    """Build an OpenAI-compatible function dict for LangChain ``bind_tools()``.

    Args:
        ns_name: Namespaced tool name (``short_id__tool_name``).
        tool: MCP tool definition.

    Returns:
        Dict ready for ``llm.bind_tools([result])``.
    """
    return {
        "type": "function",
        "function": {
            "name": ns_name,
            "description": tool.description or tool.name,
            "parameters": tool.input_schema
            or {
                "type": "object",
                "properties": {},
            },
        },
    }


def mcp_tools_to_langchain(
    tools: list[MCPToolDefinition],
    server_id: str,
) -> list[dict[str, Any]]:
    """Convert MCP tool definitions to LangChain ``bind_tools()`` format.

    Each tool is formatted as an OpenAI-compatible function definition dict,
    which is accepted by all LangChain chat model ``bind_tools()`` methods.

    Args:
        tools: MCP tool definitions from ``MCPClient.list_tools()``.
        server_id: Full UUID of the MCP server (first 8 chars used for namespace).

    Returns:
        List of tool dicts ready for ``llm.bind_tools(result)``.
    """
    return [
        _tool_to_langchain_dict(_namespace_tool_name(server_id, tool.name), tool) for tool in tools
    ]


async def discover_and_convert(
    registry: MCPRegistry,
    server_ids: list[str],
) -> tuple[list[dict[str, Any]], MCPToolExecutor | None]:
    """Discover MCP tools from multiple servers and prepare for LangChain.

    Args:
        registry: The MCP registry instance.
        server_ids: List of MCP server UUIDs to discover tools from.

    Returns:
        Tuple of ``(langchain_tool_dicts, executor)``.
        If no tools are discovered, returns ``([], None)``.
    """

    async def _discover_one(sid: str) -> tuple[str, list[MCPToolDefinition]]:
        try:
            tools = await registry.discover_tools(sid)
            return sid, tools
        except Exception as e:
            logger.warning(
                "Failed to discover tools from MCP server %s: %s",
                sid,
                e,
            )
            return sid, []

    results = await asyncio.gather(*[_discover_one(sid) for sid in server_ids])

    all_lc_tools: list[dict[str, Any]] = []
    tool_map: dict[str, tuple[str, str]] = {}

    for server_id, tools in results:
        for tool in tools:
            ns_name = _namespace_tool_name(server_id, tool.name)
            all_lc_tools.append(_tool_to_langchain_dict(ns_name, tool))
            tool_map[ns_name] = (server_id, tool.name)

    if not all_lc_tools:
        return [], None

    executor = MCPToolExecutor(registry, tool_map)
    return all_lc_tools, executor
