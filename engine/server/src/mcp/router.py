"""MCP server management endpoints.

CRUD operations for MCP server configurations + catalog-based deployment.
Available in the runtime dashboard under /api/v1/internal/mcp/.
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.auth import CurrentUser, RequireOwner
from src.mcp.validation import validate_mcp_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["MCP"])


# --- Request/Response schemas ---


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
    name: str | None = Field(None, min_length=1, max_length=255)
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
    catalog_id: str = Field(..., description="Catalog entry ID (e.g., 'brave-search')")
    secrets: dict[str, str] = Field(..., description="Required secrets/env vars")
    project_id: str | None = None


# --- Helpers ---


def _get_registry():
    from src.mcp.service import get_mcp_registry
    return get_mcp_registry()


def _get_sidecar_manager():
    from src.mcp.service import get_sidecar_manager
    return get_sidecar_manager()


def _server_to_response(config, status_info) -> MCPServerResponse:
    return MCPServerResponse(
        id=config.id,
        name=config.name,
        description=config.description,
        url=config.url,
        enabled=config.enabled,
        connected=status_info.connected,
        tools_count=status_info.tools_count,
        timeout_seconds=config.timeout_seconds,
        project_id=config.project_id,
        managed=config.managed,
        catalog_id=config.catalog_id,
        transport=config.transport.value,
    )


# --- Catalog Endpoints ---


@router.get("/catalog", dependencies=[RequireOwner])
async def list_catalog(user: CurrentUser) -> list[MCPCatalogEntryResponse]:
    """List all available MCP servers in the catalog."""
    from src.mcp import get_catalog

    return [
        MCPCatalogEntryResponse(
            id=e.id,
            name=e.name,
            description=e.description,
            category=e.category,
            icon=e.icon,
            required_secrets=[
                {
                    "key": s.key,
                    "label": s.label,
                    "placeholder": s.placeholder,
                    "required": s.required,
                    "is_secret": s.is_secret,
                }
                for s in e.required_secrets
            ],
            documentation_url=e.documentation_url,
            npm_package=e.npm_package,
            docker_image=e.docker_image,
            setup_flow=e.setup_flow,
        )
        for e in get_catalog()
    ]


@router.post("/deploy", dependencies=[RequireOwner], status_code=status.HTTP_201_CREATED)
async def deploy_from_catalog(body: MCPDeployFromCatalogRequest, user: CurrentUser) -> MCPServerResponse:
    """Deploy an MCP server from the catalog.

    Auto-detects transport: Docker sidecar if docker_image is set,
    subprocess via stdio_client if npm_package only.
    """
    import shutil

    from src.infra.secrets import secrets_store
    from src.mcp import MCPServerConfig, MCPTransport, get_catalog_entry

    entry = get_catalog_entry(body.catalog_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown catalog entry: {body.catalog_id}",
        )

    # Duplicate check
    registry = _get_registry()
    for s in registry.list_servers():
        if s.catalog_id == body.catalog_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{entry.name}' already deployed (id={s.id}). Undeploy first.",
            )

    server_id = str(uuid.uuid4())

    if entry.docker_image:
        # Docker sidecar path
        manager = _get_sidecar_manager()
        if not manager.is_available:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Docker required for this MCP server but not available.",
            )
        try:
            info = await manager.deploy(
                catalog_id=body.catalog_id,
                secrets=body.secrets,
                server_id=server_id,
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to deploy sidecar: {e}",
            )
        config = MCPServerConfig(
            id=server_id,
            name=entry.name,
            description=entry.description,
            transport=MCPTransport.HTTP,
            url=info.internal_url,
            enabled=True,
            project_id=body.project_id,
            managed=True,
            catalog_id=body.catalog_id,
        )
    elif entry.npm_package:
        # Subprocess path — SDK's stdio_client handles process lifecycle
        if not shutil.which("npx"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="npx not found. Install Node.js to deploy npm-based MCP servers.",
            )
        config = MCPServerConfig(
            id=server_id,
            name=entry.name,
            description=entry.description,
            transport=MCPTransport.STDIO,
            command="npx",
            args=["-y", entry.npm_package],
            enabled=True,
            project_id=body.project_id,
            managed=True,
            catalog_id=body.catalog_id,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Catalog entry '{entry.name}' has no docker_image or npm_package.",
        )

    # Store secrets encrypted (env stays empty on disk for STDIO)
    for key, value in body.secrets.items():
        secrets_store.set(f"MCP_{server_id}_{key}", value)

    registry.register(config)
    registry.persist_config(config)

    status_info = await registry.get_server_status(server_id)
    return _server_to_response(config, status_info)


@router.get("/sidecar-status", dependencies=[RequireOwner])
async def get_sidecar_availability(user: CurrentUser) -> dict:
    """Check if Docker sidecar auto-provisioning is available."""
    manager = _get_sidecar_manager()
    return {
        "docker_available": manager.is_available,
        "tracked_sidecars": len(manager.tracked_sidecars),
    }


# --- Server Logs ---


@router.get("/servers/{server_id}/logs", dependencies=[RequireOwner])
async def get_server_logs(
    server_id: str,
    user: CurrentUser,
    tail: int = 100,
) -> dict:
    """Read recent logs from a managed sidecar container.

    Used by the QR code setup flow to extract the WhatsApp QR code
    from the container's stdout/stderr output.
    """
    import asyncio

    registry = _get_registry()
    config = registry.get_server(server_id)
    if not config:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if not config.managed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logs are only available for managed sidecar servers",
        )

    manager = _get_sidecar_manager()
    info = manager.tracked_sidecars.get(server_id)
    if not info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sidecar container not found",
        )

    try:
        docker_client = await manager._get_docker()
        container = await asyncio.to_thread(
            docker_client.containers.get, info.container_id
        )
        logs_bytes = await asyncio.to_thread(
            container.logs, tail=min(tail, 500), timestamps=False
        )
        logs_text = logs_bytes.decode("utf-8", errors="replace")

        # Some MCP servers (e.g. WhatsApp) write internal logs to files
        # instead of stdout/stderr. Read those too for QR code extraction.
        app_logs = ""
        for log_file in ("wa-logs.txt", "mcp-logs.txt"):
            try:
                exit_code, output = await asyncio.to_thread(
                    container.exec_run,
                    ["tail", "-n", str(min(tail, 500)), log_file],
                )
                if exit_code == 0:
                    app_logs += output.decode("utf-8", errors="replace") + "\n"
            except Exception:
                pass

        return {
            "server_id": server_id,
            "logs": logs_text + "\n" + app_logs if app_logs else logs_text,
            "container_status": container.status,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to read container logs: {e}",
        )


# --- Server CRUD Endpoints ---


@router.get("/servers", dependencies=[RequireOwner])
async def list_mcp_servers(user: CurrentUser, project_id: str | None = None) -> list[MCPServerResponse]:
    """List all configured MCP servers with status."""
    registry = _get_registry()
    servers = registry.list_servers(project_id)
    statuses = await registry.get_all_statuses()
    status_map = {s.server_id: s for s in statuses}

    from src.mcp import MCPServerStatus

    default_status = lambda cfg: MCPServerStatus(
        server_id=cfg.id, name=cfg.name, connected=False, tools_count=0,
    )
    return [
        _server_to_response(cfg, status_map.get(cfg.id, default_status(cfg)))
        for cfg in servers
    ]


@router.post("/servers", dependencies=[RequireOwner], status_code=status.HTTP_201_CREATED)
async def create_mcp_server(body: MCPServerCreateRequest, user: CurrentUser) -> MCPServerResponse:
    """Register a new MCP server (manual URL entry)."""
    # SSRF validation (only for user-provided URLs, not managed sidecars)
    url_error = validate_mcp_url(body.url)
    if url_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MCP server URL: {url_error}",
        )

    from src.infra.secrets import secrets_store
    from src.mcp import MCPServerConfig, MCPTransport

    server_id = str(uuid.uuid4())

    # Store API key in secrets if provided
    secret_ref = None
    if body.api_key:
        secret_ref = f"MCP_{server_id}_TOKEN"
        secrets_store.set(secret_ref, body.api_key)

    config = MCPServerConfig(
        id=server_id,
        name=body.name,
        description=body.description,
        transport=MCPTransport.HTTP,
        url=body.url,
        headers=body.headers,
        secret_ref=secret_ref,
        enabled=body.enabled,
        timeout_seconds=body.timeout_seconds,
        project_id=body.project_id,
    )

    registry = _get_registry()
    registry.register(config)
    registry.persist_config(config)

    status_info = await registry.get_server_status(server_id)
    return _server_to_response(config, status_info)


@router.patch("/servers/{server_id}", dependencies=[RequireOwner])
async def update_mcp_server(
    server_id: str, body: MCPServerUpdateRequest, user: CurrentUser
) -> MCPServerResponse:
    """Update an MCP server configuration."""
    from src.infra.secrets import secrets_store

    registry = _get_registry()
    existing = registry.get_server(server_id)
    if not existing:
        raise HTTPException(status_code=404, detail="MCP server not found")

    update_data = body.model_dump(exclude_unset=True)

    # SSRF validation on URL update (skip for managed servers)
    if "url" in update_data and update_data["url"] and not existing.managed:
        url_error = validate_mcp_url(update_data["url"])
        if url_error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid MCP server URL: {url_error}",
            )

    # Handle API key update
    if "api_key" in update_data:
        api_key = update_data.pop("api_key")
        if api_key:
            secret_ref = existing.secret_ref or f"MCP_{server_id}_TOKEN"
            secrets_store.set(secret_ref, api_key)
            update_data["secret_ref"] = secret_ref
        elif existing.secret_ref:
            secrets_store.delete(existing.secret_ref)
            update_data["secret_ref"] = None

    updated = existing.model_copy(update=update_data)
    registry.register(updated)
    registry.persist_config(updated)

    status_info = await registry.get_server_status(server_id)
    return _server_to_response(updated, status_info)


@router.delete("/servers/{server_id}", dependencies=[RequireOwner])
async def delete_mcp_server(server_id: str, user: CurrentUser) -> dict:
    """Remove an MCP server. If managed, also removes the sidecar container."""
    from src.infra.secrets import secrets_store

    registry = _get_registry()
    config = registry.get_server(server_id)
    if not config:
        raise HTTPException(status_code=404, detail="MCP server not found")

    # Clean up all secrets for this server (covers both secret_ref and catalog secrets)
    prefix = f"MCP_{server_id}_"
    for key in secrets_store.list_keys(prefix):
        secrets_store.delete(key)

    # If managed sidecar, remove the Docker container
    if config.managed:
        manager = _get_sidecar_manager()
        await manager.undeploy(server_id)

    registry.unregister(server_id)
    registry.delete_config(server_id)
    return {"status": "deleted", "server_id": server_id}


# --- Test & Tools (mirror from usage_router for internal path) ---


@router.post("/servers/{server_id}/test", dependencies=[RequireOwner])
async def test_mcp_connection(server_id: str, user: CurrentUser) -> dict:
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


@router.get("/servers/{server_id}/tools", dependencies=[RequireOwner])
async def list_server_tools(server_id: str, user: CurrentUser) -> list[dict]:
    """Discover tools available on an MCP server."""
    registry = _get_registry()
    if not registry.get_server(server_id):
        raise HTTPException(status_code=404, detail="MCP server not found")

    try:
        tools = await registry.discover_tools(server_id)
        return [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to discover tools: {e}",
        )


