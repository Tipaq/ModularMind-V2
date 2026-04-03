"""MCP protocol schemas and configuration models."""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class MCPTransport(StrEnum):
    HTTP = "http"
    STDIO = "stdio"


class MCPServerConfig(BaseModel):
    """Configuration for a registered MCP server."""

    id: str = Field(..., description="Unique server identifier (full UUID)")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    transport: MCPTransport = MCPTransport.HTTP
    url: str | None = Field(None, description="Server URL for Streamable HTTP transport")
    command: str | None = Field(None, description="Command for stdio transport")
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    headers: dict[str, str] = Field(
        default_factory=dict, description="HTTP headers (e.g., Authorization)"
    )
    secret_ref: str | None = Field(None, description="SecretsStore key for API key/token")
    enabled: bool = True
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    project_id: str | None = Field(None, description="Scope to project (None = all projects)")
    managed: bool = Field(
        False, description="True if provisioned via sidecar manager (trusted URL)"
    )
    catalog_id: str | None = Field(None, description="Catalog entry ID if deployed from catalog")


class MCPToolDefinition(BaseModel):
    """A tool exposed by an MCP server (from tools/list response)."""

    name: str
    description: str | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)


class MCPToolCallRequest(BaseModel):
    """Request to call a tool on an MCP server."""

    server_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class MCPToolCallResult(BaseModel):
    """Result from a tool call."""

    content: list[dict[str, Any]] = Field(default_factory=list)
    is_error: bool = False


class MCPServerStatus(BaseModel):
    """Status of an MCP server connection."""

    server_id: str
    name: str
    connected: bool
    tools_count: int = 0
    last_health_check: str | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Router request/response schemas
# ---------------------------------------------------------------------------


class MCPServerCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    url: str = Field(..., description="MCP server URL (Streamable HTTP)")
    headers: dict[str, str] = Field(default_factory=dict)
    api_key: str | None = Field(None, description="API key/token (stored encrypted)")
    enabled: bool = True
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    project_id: str | None = None


class MCPServerUpdateRequest(BaseModel):
    description: str | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    api_key: str | None = None
    enabled: bool | None = None
    timeout_seconds: int | None = Field(None, ge=5, le=120)


class MCPServerResponse(BaseModel):
    id: str
    name: str
    description: str | None
    url: str | None
    enabled: bool
    connected: bool
    tools_count: int
    timeout_seconds: int
    project_id: str | None
    managed: bool = False
    catalog_id: str | None = None
    transport: str = "http"


class MCPCatalogEntryResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    icon: str
    required_secrets: list[dict]
    documentation_url: str | None
    npm_package: str | None = None
    docker_image: str | None = None
    setup_flow: str | None = None


class MCPDeployFromCatalogRequest(BaseModel):
    catalog_id: str = Field(..., description="Catalog entry ID (e.g., 'slack')")
    secrets: dict[str, str] = Field(..., description="Required secrets/env vars")
    project_id: str | None = None


class MCPToolCallRequestBody(BaseModel):
    tool_name: str
    arguments: dict = Field(default_factory=dict)


class MCPToolCallResponseBody(BaseModel):
    content: list[dict]
    is_error: bool
