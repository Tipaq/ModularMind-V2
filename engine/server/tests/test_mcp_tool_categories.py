"""Tests for MCP tools unified with tool_categories.

Covers:
- Gate 1: MCPRegistry.get_server_by_name + duplicate name rejection
- Gate 2: resolve_mcp_tool_definitions
- Gate 5: Tools router individual MCP categories
"""

import os
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/modularmind_test",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")

import pytest

from src.mcp.registry import MCPRegistry
from src.mcp.schemas import MCPServerConfig, MCPToolDefinition


def _make_server(name: str, enabled: bool = True) -> MCPServerConfig:
    return MCPServerConfig(
        id=str(uuid4()),
        name=name,
        url=f"http://{name}.local/mcp",
        enabled=enabled,
    )


def _make_tool(name: str, description: str = "") -> MCPToolDefinition:
    return MCPToolDefinition(
        name=name,
        description=description,
        input_schema={"type": "object", "properties": {}},
    )


# ─── Gate 1: Registry helpers ─────────────────────────────────────────────


class TestGetServerByName:
    def test_returns_none_when_no_servers(self):
        registry = MCPRegistry()
        assert registry.get_server_by_name("fastcode") is None

    def test_returns_matching_server(self):
        registry = MCPRegistry()
        server = _make_server("fastcode")
        registry._servers[server.id] = server
        result = registry.get_server_by_name("fastcode")
        assert result is not None
        assert result.id == server.id
        assert result.name == "fastcode"

    def test_returns_none_for_wrong_name(self):
        registry = MCPRegistry()
        server = _make_server("fastcode")
        registry._servers[server.id] = server
        assert registry.get_server_by_name("other") is None

    def test_returns_correct_server_among_multiple(self):
        registry = MCPRegistry()
        server_a = _make_server("alpha")
        server_b = _make_server("beta")
        registry._servers[server_a.id] = server_a
        registry._servers[server_b.id] = server_b
        result = registry.get_server_by_name("beta")
        assert result is not None
        assert result.id == server_b.id


class TestRegisterDuplicateName:
    def test_rejects_duplicate_name_on_enabled_server(self):
        registry = MCPRegistry()
        server_a = _make_server("fastcode", enabled=True)
        registry.register(server_a)
        server_b = _make_server("fastcode", enabled=True)
        with pytest.raises(ValueError, match="already used"):
            registry.register(server_b)

    def test_allows_same_name_when_existing_is_disabled(self):
        registry = MCPRegistry()
        server_a = _make_server("fastcode", enabled=False)
        registry.register(server_a)
        server_b = _make_server("fastcode", enabled=True)
        registry.register(server_b)
        assert server_b.id in registry._servers

    def test_allows_re_registering_same_server_id(self):
        registry = MCPRegistry()
        server = _make_server("fastcode", enabled=True)
        registry.register(server)
        updated = server.model_copy(update={"description": "updated"})
        registry.register(updated)
        assert registry._servers[server.id].description == "updated"


# ─── Gate 2: resolve_mcp_tool_definitions ──────────────────────────────────


@pytest.mark.asyncio
class TestResolveMcpToolDefinitions:
    async def test_resolves_enabled_mcp_category(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()
        server = _make_server("myserver")
        registry._servers[server.id] = server

        tools = [_make_tool("search"), _make_tool("create")]
        registry.discover_tools = AsyncMock(return_value=tools)

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"mcp:myserver": True}, registry
        )
        assert len(lc_tools) == 2
        assert executor is not None
        tool_names = [t["function"]["name"] for t in lc_tools]
        assert any("search" in n for n in tool_names)
        assert any("create" in n for n in tool_names)

    async def test_skips_disabled_mcp_category(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()
        server = _make_server("myserver")
        registry._servers[server.id] = server

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"mcp:myserver": False}, registry
        )
        assert lc_tools == []
        assert executor is None

    async def test_skips_unknown_server(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"mcp:unknown": True}, registry
        )
        assert lc_tools == []
        assert executor is None

    async def test_ignores_non_mcp_categories(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()
        server = _make_server("myserver")
        registry._servers[server.id] = server

        tools = [_make_tool("search")]
        registry.discover_tools = AsyncMock(return_value=tools)

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"knowledge": True, "mcp:myserver": True}, registry
        )
        assert len(lc_tools) == 1
        assert "search" in lc_tools[0]["function"]["name"]

    async def test_per_tool_filtering(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()
        server = _make_server("myserver")
        registry._servers[server.id] = server

        tools = [_make_tool("tool_a"), _make_tool("tool_b"), _make_tool("tool_c")]
        registry.discover_tools = AsyncMock(return_value=tools)

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"mcp:myserver": {"tool_a": True, "tool_b": False}},
            registry,
        )
        assert len(lc_tools) == 2
        tool_names = [t["function"]["name"] for t in lc_tools]
        assert any("tool_a" in n for n in tool_names)
        assert any("tool_c" in n for n in tool_names)
        assert not any("tool_b" in n for n in tool_names)

    async def test_skips_disabled_server(self):
        from src.tools.registry import resolve_mcp_tool_definitions

        registry = MCPRegistry()
        server = _make_server("myserver", enabled=False)
        registry._servers[server.id] = server

        lc_tools, executor, _by_server = await resolve_mcp_tool_definitions(
            {"mcp:myserver": True}, registry
        )
        assert lc_tools == []
        assert executor is None


# ─── Gate 5: Tools router individual categories ──────────────────────────


@pytest.mark.asyncio
class TestToolsRouterMcpCategories:
    async def test_mcp_servers_as_individual_categories(self):
        from src.tools.router import _collect_mcp_tools

        mock_tools_server1 = [
            MCPToolDefinition(name="t1", description="tool1", input_schema={}),
            MCPToolDefinition(name="t2", description="tool2", input_schema={}),
        ]
        mock_tools_server2 = [
            MCPToolDefinition(name="t3", description="tool3", input_schema={}),
        ]

        server1 = _make_server("server1")
        server2 = _make_server("server2")

        mock_registry = MCPRegistry()
        mock_registry._servers[server1.id] = server1
        mock_registry._servers[server2.id] = server2

        async def mock_discover(sid):
            if sid == server1.id:
                return mock_tools_server1
            return mock_tools_server2

        mock_registry.discover_tools = mock_discover

        with patch("src.mcp.service.get_mcp_registry", return_value=mock_registry):
            result = await _collect_mcp_tools()

        assert "server1" in result
        assert "server2" in result
        assert len(result["server1"]) == 2
        assert len(result["server2"]) == 1
        assert result["server1"][0].category == "mcp:server1"
        assert result["server2"][0].category == "mcp:server2"
