"""MCP usage endpoints.

Public endpoints for discovering and calling MCP tools.
Available to all authenticated users at /api/v1/mcp/.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.auth import CurrentUser
from src.mcp.schemas import MCPToolDefinition

logger = logging.getLogger(__name__)

usage_router = APIRouter(prefix="/mcp", tags=["MCP Usage"])


# --- Schemas ---

MCPToolResponse = MCPToolDefinition


class MCPToolCallRequestBody(BaseModel):
    tool_name: str
    arguments: dict = Field(default_factory=dict)


class MCPToolCallResponseBody(BaseModel):
    content: list[dict]
    is_error: bool


# --- Helpers ---


def _get_registry():
    from src.mcp.service import get_mcp_registry
    return get_mcp_registry()


# --- Usage Endpoints (all authenticated users) ---


@usage_router.get("/servers/{server_id}/tools")
async def list_server_tools(server_id: str, user: CurrentUser) -> list[MCPToolResponse]:
    """Discover tools available on an MCP server."""
    registry = _get_registry()
    if not registry.get_server(server_id):
        raise HTTPException(status_code=404, detail="MCP server not found")

    try:
        tools = await registry.discover_tools(server_id)
        return [MCPToolResponse(name=t.name, description=t.description, input_schema=t.input_schema) for t in tools]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to discover tools: {e}")


@usage_router.post("/servers/{server_id}/tools/call")
async def call_server_tool(
    server_id: str, body: MCPToolCallRequestBody, user: CurrentUser
) -> MCPToolCallResponseBody:
    """Call a tool on an MCP server."""
    from src.mcp import MCPToolCallRequest

    registry = _get_registry()
    if not registry.get_server(server_id):
        raise HTTPException(status_code=404, detail="MCP server not found")

    try:
        client = await registry.get_client(server_id)
        result = await client.call_tool(MCPToolCallRequest(
            server_id=server_id, tool_name=body.tool_name, arguments=body.arguments,
        ))
        return MCPToolCallResponseBody(content=result.content, is_error=result.is_error)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Tool call failed: {e}")


@usage_router.post("/servers/{server_id}/test")
async def test_mcp_connection(server_id: str, user: CurrentUser) -> dict[str, Any]:
    """Test connectivity to an MCP server."""
    registry = _get_registry()
    if not registry.get_server(server_id):
        raise HTTPException(status_code=404, detail="MCP server not found")

    status_info = await registry.get_server_status(server_id)
    return {
        "server_id": server_id,
        "connected": status_info.connected,
        "tools_count": status_info.tools_count,
        "error": status_info.error,
    }
