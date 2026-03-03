---
title: 'MCP SDK Migration & Hybrid Deployment'
slug: 'mcp-hybrid-deployment'
created: '2026-03-01'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Python 3.12 / FastAPI
  - 'mcp SDK >= 1.26.0 (official Model Context Protocol Python SDK)'
  - Docker (sidecar containers via mcp-proxy)
  - ghcr.io/sparfenyuk/mcp-proxy (stdio-to-HTTP bridge)
  - React + shadcn/ui (Ops console)
  - '@modularmind/api-client'
files_to_modify:
  - engine/server/pyproject.toml
  - engine/server/src/mcp/sdk_client.py (new)
  - engine/server/src/mcp/client.py (delete)
  - engine/server/src/mcp/__init__.py
  - engine/server/src/mcp/schemas.py
  - engine/server/src/mcp/registry.py
  - engine/server/src/mcp/service.py (hybrid deploy + health check loop)
  - engine/server/src/mcp/tool_adapter.py (rate limiting)
  - engine/server/src/mcp/router.py
  - engine/server/src/infra/secrets.py (add prefix filter to list_keys)
  - Makefile
  - packages/api-client/src/types/settings.ts
  - apps/ops/src/components/configuration/McpServersTab.tsx
code_patterns:
  - AsyncExitStack for long-lived SDK context managers in registry lazy-init pattern
  - SidecarManager Docker deployment (mcp-proxy wrapping stdio servers as HTTP)
  - Catalog-driven deployment with CatalogSecret for env var injection
  - MCPRegistry per-server asyncio locks with double-checked locking
  - Tool namespacing (short_id__tool_name) for LangChain bind_tools()
  - JSON config persistence to CONFIG_DIR/mcp/*.json
  - _TokenBucket for in-process rate limiting (reused for MCP tool calls)
  - Background asyncio.Task for periodic health checks in API process
test_patterns:
  - pytest + pytest-asyncio for async tests
  - httpx mocking for HTTP transport tests
  - Docker SDK mocking for sidecar tests
---

# Tech-Spec: MCP SDK Migration & Hybrid Deployment

**Created:** 2026-03-01

## Overview

### Problem Statement

The MCP system has three issues blocking production use:

1. **Non-existent Docker images**: Five catalog entries reference custom images via `docker_image` (`modularmind/mcp-duckduckgo`, `modularmind/mcp-qdrant`, `modularmind/mcp-motherduck`, `modularmind/mcp-puppeteer`, `modularmind/mcp-whatsapp`) that have never been built. Additionally, `modularmind/mcp-node-proxy` (base image for npm-based sidecar deployments) and `modularmind/mcp-brave-search` have Dockerfiles but are also unbuilt. The 7 Dockerfiles exist at `engine/mcp-sidecars/mcp-sidecars/` but there is no build infrastructure (no Makefile target, no CI step). Deploying any catalog entry that depends on these images fails with a 502 "pull access denied" error.

2. **Outdated custom client**: The MCP client (`client.py`, 300 lines) manually implements JSON-RPC 2.0 with protocol version `2024-11-05`. The current MCP spec version is `2025-11-25`. The official `mcp` Python SDK (v1.26.0) handles protocol negotiation, session management, SSE parsing, and resumability natively.

3. **Docker-only deployment**: All MCP servers require Docker sidecars. The `MCPServerConfig` schema already has `command`, `args`, `env` fields for stdio transport but they are unused (marked "Phase 3"). Using the SDK's `stdio_client`, npm-based MCP servers can run as direct subprocesses — no Docker container needed. Docker should only be required when `docker_image` is set (entries needing system dependencies like Chromium, pip packages, etc.).

4. **No observability**: No health checks on MCP servers (silent failures), no rate limiting on tool calls (LLM loops can hammer a server).

### Solution

1. **Build infrastructure**: Add `make build-mcp-sidecars` target that builds all 7 sidecar images in dependency order.

2. **SDK migration**: Replace the 300-line custom HTTP client with a ~120-line wrapper around the official `mcp` SDK. This gets protocol version `2025-11-25`, native Streamable HTTP + stdio transport support for free.

3. **Hybrid deployment (auto-detect)**: No configuration setting needed. The rule is simple:
   - If `entry.docker_image` is set → Docker sidecar (current path)
   - If `entry.npm_package` is set and no `docker_image` → subprocess via `stdio_client`
   - Deploy logic is inline in `router.py` and `service.py` (~20 lines each), no new manager class.

4. **Health checks + rate limiting**: Periodic MCP health pings via APScheduler (reuse existing scheduler). Per-server rate limiting on tool calls via `_TokenBucket` in `tool_adapter.py`.

### Scope

**In Scope:**

- Makefile target to build all sidecar Docker images
- Replace `client.py` with SDK-based client supporting both HTTP and stdio transports
- Activate `MCPTransport.STDIO` (remove "Phase 3" marker)
- Inline hybrid deploy logic in `router.py` and `service.py`
- Periodic health check loop in API process (background asyncio task)
- Per-server rate limiting on MCP tool calls
- Frontend transport badge and catalog visibility without Docker

**Out of Scope:**

- MCP Gateway pattern (aggregating multiple servers behind one endpoint)
- OAuth 2.1 for remote MCP servers
- Named servers feature of mcp-proxy
- Custom MCP server development

## Context for Development

### Codebase Patterns

**Engine (Python):**
- MCP system lives in `engine/server/src/mcp/` (11 files, ~2650 lines total)
- `MCPRegistry` manages configs + client connections with per-server asyncio locks and 60s tool cache
- `SidecarManager` provisions Docker containers on the `mm-engine` network via Docker socket
- Catalog entries define either `npm_package` (uses `mcp-node-proxy` image) or `docker_image` + `server_command` (uses custom image)
- Configs persisted as JSON files in `CONFIG_DIR/mcp/*.json`
- `MCPToolExecutor` dispatches tool calls by namespaced name (`short_id__tool_name`)
- `SecretsStore` (`infra/secrets.py`) provides Fernet-encrypted storage — already a vault
- `RateLimitMiddleware` + `RateLimitDependency` + `_TokenBucket` exist in `infra/rate_limit.py`
- `APScheduler` in `worker/scheduler.py` runs 4 periodic jobs in the worker process (sync, report, cleanup, consolidation)
- Worker process has its own `MCPRegistry` instance with NO live client connections (see `service.py` docstring)

**Sidecar Dockerfiles (7 files at `engine/mcp-sidecars/mcp-sidecars/`):**
- `Dockerfile.node-proxy`: mcp-proxy + Node.js + npm (base for npm entries)
- `Dockerfile.duckduckgo`: mcp-proxy + `pip install duckduckgo-mcp-server`
- `Dockerfile.qdrant`: mcp-proxy + `pip install mcp-server-qdrant fastembed`
- `Dockerfile.motherduck`: mcp-proxy + build tools + `pip install mcp-server-motherduck`
- `Dockerfile.brave-search`: mcp-proxy + Node.js + npm (for brave-search)
- `Dockerfile.puppeteer`: mcp-node-proxy + Chromium
- `Dockerfile.whatsapp`: mcp-node-proxy + git + pre-installed npm packages

**Build dependency chain:**
```
ghcr.io/sparfenyuk/mcp-proxy:latest  (external)
├── modularmind/mcp-node-proxy       (Dockerfile.node-proxy)
│   ├── modularmind/mcp-puppeteer    (Dockerfile.puppeteer)
│   └── modularmind/mcp-whatsapp     (Dockerfile.whatsapp)
├── modularmind/mcp-brave-search     (Dockerfile.brave-search)
├── modularmind/mcp-duckduckgo       (Dockerfile.duckduckgo)
├── modularmind/mcp-qdrant           (Dockerfile.qdrant)
└── modularmind/mcp-motherduck       (Dockerfile.motherduck)
```

**MCP SDK API (v1.26.0):**
```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

# HTTP transport — returns 2-tuple (read_stream, write_stream)
async with streamable_http_client(url) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
        # SDK uses snake_case for Python attribute access:
        #   tool.input_schema (NOT inputSchema)
        #   result.is_error   (NOT isError)
        result = await session.call_tool("tool_name", {"arg": "value"})

# stdio transport — returns 2-tuple (read_stream, write_stream)
params = StdioServerParameters(command="npx", args=["-y", "package"])
async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `engine/server/src/mcp/client.py` | Current custom HTTP client (300 lines, to be replaced) |
| `engine/server/src/mcp/registry.py` | MCPRegistry: lazy client init, tool cache, project scoping |
| `engine/server/src/mcp/schemas.py` | MCPServerConfig, MCPToolDefinition, MCPTransport enum |
| `engine/server/src/mcp/sidecar.py` | SidecarManager: Docker container lifecycle |
| `engine/server/src/mcp/service.py` | Startup/shutdown lifecycle, auto-deploy, bootstrap |
| `engine/server/src/mcp/tool_adapter.py` | MCPToolExecutor, discover_and_convert for LangChain |
| `engine/server/src/mcp/__init__.py` | Barrel exports (MCPClient alias used by all consumers) |
| `engine/server/src/mcp/catalog.py` | 38 catalog entries with CatalogSecret definitions |
| `engine/server/src/mcp/router.py` | Admin CRUD endpoints, deploy from catalog |
| `engine/server/src/infra/rate_limit.py` | _TokenBucket (reuse for MCP tool rate limiting) |
| `engine/server/src/infra/secrets.py` | SecretsStore — Fernet-encrypted vault (add prefix filter to list_keys) |
| `engine/mcp-sidecars/mcp-sidecars/Dockerfile.*` | Sidecar image definitions (7 files) |
| `Makefile` | Build/dev commands (missing MCP sidecar build target) |

### Technical Decisions

1. **`AsyncExitStack` for SDK context managers**: The `mcp` SDK uses `async with` context managers (`stdio_client`, `streamable_http_client`, `ClientSession`). The registry needs long-lived connections with lazy initialization. Each `MCPSDKClient` holds an `AsyncExitStack` that keeps context managers alive. On `connect()`, contexts are entered via `enter_async_context()`. On `disconnect()`, the stack is closed via `aclose()`.

2. **Alias swap + fix 3 direct imports**: The `__init__.py` barrel exports `MCPClient` from `client.py`. Changing this single import covers most consumers. Three files import directly from `.client` bypassing the barrel — these MUST be fixed:
   - `registry.py` line 14: `from .client import MCPClient, MCPClientError`
   - `tool_adapter.py` line 14: `from .client import MCPClientError`
   - `service.py` line 235: `from src.mcp.client import MCPClientError`

3. **No SubprocessManager class**: The SDK's `stdio_client` handles subprocess spawn and cleanup internally via `anyio.open_process()`. Deploy logic is ~20 lines inline: build `MCPServerConfig` with `transport=STDIO`, `command="npx"`, `args=["-y", npm_package]`. When the registry calls `client.connect()`, the SDK starts the subprocess. When `client.disconnect()`, the SDK kills it. No custom process management needed.

4. **No MCP_DEPLOY_MODE setting**: Auto-detection is the only behavior. `docker_image` set → Docker. `npm_package` only → subprocess. This is a strict rule — entries with `docker_image` always require Docker even if they also have `npm_package`, because the Docker image provides system dependencies (Chromium, pip packages, git) not available on bare host.

5. **Build order matters**: `mcp-node-proxy` must be built first since `puppeteer` and `whatsapp` depend on it.

6. **Secrets never in plaintext on disk**: Subprocess-deployed configs store secrets via `secrets_store.set()` with key pattern `MCP_{server_id}_{key}`. `config.env` stays empty in the persisted JSON. At connect time, secrets are resolved from the store and injected into `config.env` in-memory only.

7. **Health checks via background asyncio task in API process**: MCP clients only live in the API process (worker has its own registry with no connections — see `service.py` docstring). A background `asyncio.Task` loops every 2 minutes pinging connected servers via `session.send_ping()`. Launched from `startup_mcp()`, cancelled in `shutdown_mcp()`.

8. **Rate limiting via shared `_TokenBucket`**: A single `_TokenBucket` instance tracks all MCP servers by `server_id` key (30 calls/min per server). Checked in `MCPToolExecutor.execute()` before dispatching. Prevents LLM tool-call loops. No Redis needed — tool calls are always local to the API process. The bucket's built-in cleanup handles stale entries.

## Implementation Plan

### Tasks

#### Phase 1: Build Infrastructure

- [ ] Task 1: Add `build-mcp-sidecars` Makefile target
  - File: `Makefile`
  - Action: Add target that builds all 7 sidecar images in dependency order (`mcp-node-proxy` first).
    ```makefile
    build-mcp-sidecars: ## Build MCP sidecar Docker images
    	docker build -t modularmind/mcp-node-proxy:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.node-proxy engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-brave-search:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.brave-search engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-duckduckgo:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.duckduckgo engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-qdrant:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.qdrant engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-motherduck:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.motherduck engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-puppeteer:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.puppeteer engine/mcp-sidecars/mcp-sidecars/
    	docker build -t modularmind/mcp-whatsapp:latest -f engine/mcp-sidecars/mcp-sidecars/Dockerfile.whatsapp engine/mcp-sidecars/mcp-sidecars/
    ```
  - Notes: Add `build-mcp-sidecars` to `.PHONY`. Consider adding as dependency of `deploy`.

#### Phase 2: SDK Client Migration

- [ ] Task 2: Add `mcp` SDK dependency
  - File: `engine/server/pyproject.toml`
  - Action: Add `"mcp>=1.26.0"` to the `dependencies` list.

- [ ] Task 3: Create SDK-based client wrapper
  - File: `engine/server/src/mcp/sdk_client.py` (new)
  - Action: Create `MCPSDKClient` class wrapping the official `mcp` SDK. Must expose the same public interface as `MCPClient`:
    - Use `contextlib.AsyncExitStack` for lazy-init pattern
    - `connect()`: create stack, enter `streamable_http_client(url)` or `stdio_client(params)` context, enter `ClientSession(read, write)` context, call `session.initialize()`
    - `disconnect()`: call `self._exit_stack.aclose()`
    - `list_tools()`: `self._session.list_tools()` → convert SDK `Tool` to `MCPToolDefinition`. SDK attributes: `.input_schema` (snake_case)
    - `call_tool()`: `self._session.call_tool(name, arguments)` → `MCPToolCallResult`. SDK result: `.is_error` (snake_case)
    - `health_check()`: `self._session.send_ping()` wrapped in try/except — returns `EmptyResult`, not bool; treat any non-exception response as healthy
    - HTTP: `streamable_http_client(url)` — returns 2-tuple `(read, write)`. For servers with `config.headers`, create `httpx.AsyncClient` and pass via `http_client` parameter.
    - STDIO: `stdio_client(StdioServerParameters(command=config.command, args=config.args, env=config.env or None))` — when `env` is `None`, the SDK uses `get_default_environment()` (a curated safe subset of system env vars). When `env` is provided (e.g. secrets resolved from `secrets_store`), those vars are merged with the default set by the SDK internally.
    - Properties: `is_connected`, `is_healthy`, `get_cached_tools()`
    - Keep `_consecutive_failures` counter
    - Export: `MCPClientError`, `MCPConnectionError`, `MCPToolError`

- [ ] Task 4: Swap client import + fix all 3 direct imports
  - Files: `__init__.py`, `registry.py`, `tool_adapter.py`, `service.py`
  - Action:
    1. `__init__.py` line 11: `from .sdk_client import MCPSDKClient as MCPClient, MCPClientError, MCPConnectionError, MCPToolError`
    2. `registry.py` line 14: `from . import MCPClient, MCPClientError`
    3. `tool_adapter.py` line 14: `from . import MCPClientError`
    4. `service.py` line 235: `from src.mcp import MCPClientError`
  - Notes: After fixing, verify with `grep -r "from .client import\|from src.mcp.client import" engine/server/src/` — should return zero results.

- [ ] Task 5: Delete old client
  - File: `engine/server/src/mcp/client.py`
  - Action: Delete entirely. Task 4 must be completed first.

#### Phase 3: Hybrid Deployment (inline logic)

- [ ] Task 6: Activate STDIO transport in schema
  - File: `engine/server/src/mcp/schemas.py`
  - Action: Line 22 — change `"Command for stdio transport (Phase 3)"` to `"Command for stdio transport"`.

- [ ] Task 7a: Add `prefix` filter to `SecretsStore.list_keys()`
  - File: `engine/server/src/infra/secrets.py`
  - Action: The current `list_keys()` method (line 245) takes no parameters and returns all keys. Add an optional `prefix` parameter:
    ```python
    def list_keys(self, prefix: str | None = None) -> list[str]:
        """List available secret keys, optionally filtered by prefix."""
        with self._lock:
            if prefix:
                return [k for k in self._secrets if k.startswith(prefix)]
            return list(self._secrets.keys())
    ```
  - Notes: Backward compatible — existing callers that pass no argument still work.

- [ ] Task 7b: Update registry for STDIO support
  - File: `engine/server/src/mcp/registry.py`
  - Action:
    1. Line 181: change `if not client and config.enabled and config.url:` to `if not client and config.enabled and (config.url or config.command):`
    2. In `get_client()` (around line 129), before `client = MCPClient(config)`, resolve secrets for STDIO configs:
       ```python
       if config.transport == MCPTransport.STDIO and not config.env:
           from src.infra.secrets import secrets_store
           resolved_env = {}
           prefix = f"MCP_{config.id}_"
           for key in secrets_store.list_keys(prefix):
               env_key = key.removeprefix(prefix)
               resolved_env[env_key] = secrets_store.get(key)
           if resolved_env:
               config = config.model_copy(update={"env": resolved_env})
       ```
  - Notes: Resolved env is set on in-memory copy only — NOT persisted to disk. Depends on Task 7a for the `list_keys(prefix)` API.

- [ ] Task 8: Update deploy endpoint for hybrid mode
  - File: `engine/server/src/mcp/router.py`
  - Action: Update `deploy_from_catalog()` with inline hybrid logic:
    ```python
    entry = get_catalog_entry(body.catalog_id)
    # ... existing entry validation ...

    # Duplicate check
    registry = _get_registry()
    for s in registry.list_servers():
        if s.catalog_id == body.catalog_id:
            raise HTTPException(409, f"'{entry.name}' already deployed (id={s.id}). Undeploy first.")

    server_id = str(uuid.uuid4())

    if entry.docker_image:
        # Docker sidecar path (existing logic)
        manager = _get_sidecar_manager()
        if not manager.is_available:
            raise HTTPException(503, "Docker required for this MCP server but not available.")
        info = await manager.deploy(catalog_id=body.catalog_id, secrets=body.secrets, server_id=server_id)
        config = MCPServerConfig(
            id=server_id, name=entry.name, description=entry.description,
            transport=MCPTransport.HTTP, url=info.internal_url,
            enabled=True, project_id=body.project_id, managed=True, catalog_id=body.catalog_id,
        )
    elif entry.npm_package:
        # Subprocess path — SDK's stdio_client handles process lifecycle
        import shutil
        if not shutil.which("npx"):
            raise HTTPException(503, "npx not found. Install Node.js to deploy npm-based MCP servers.")
        config = MCPServerConfig(
            id=server_id, name=entry.name, description=entry.description,
            transport=MCPTransport.STDIO, command="npx", args=["-y", entry.npm_package],
            enabled=True, project_id=body.project_id, managed=True, catalog_id=body.catalog_id,
        )
    else:
        raise HTTPException(400, f"Catalog entry '{entry.name}' has no docker_image or npm_package.")

    # Store secrets encrypted
    for key, value in body.secrets.items():
        secrets_store.set(f"MCP_{server_id}_{key}", value)

    registry.register(config)
    registry.persist_config(config)
    ```
  - Notes: Add `transport: str = "http"` to `MCPServerResponse` and populate from `config.transport.value` in `_server_to_response()`.

- [ ] Task 9: Update auto-deploy for hybrid mode
  - File: `engine/server/src/mcp/service.py`
  - Action: Modify the **inner loop body** of `_auto_deploy_free_catalog_entries()` (the `for entry in free_entries:` block inside the `try:` block). **Preserve the existing file lock mechanism** (lines 104-118), the `registry.load_from_disk()` call inside the lock, the per-entry `try/except`, and the `deployed` counter. Only change the deploy logic per entry:
    1. Add `import shutil` and check `has_npx = shutil.which("npx") is not None` and `has_docker = manager.is_available` before the loop.
    2. Add a startup summary log: `logger.info("MCP auto-deploy: docker=%s, npx=%s, %d free entries", has_docker, has_npx, len(free_entries))`
    3. Replace the loop body:
    ```python
    for entry in free_entries:
        if entry.id in existing_catalog_ids:
            logger.debug("MCP auto-deploy: %s already registered, skipping", entry.name)
            continue

        server_id = str(uuid.uuid4())
        try:
            if entry.docker_image and has_docker:
                # Docker sidecar path (existing)
                info = await manager.deploy(catalog_id=entry.id, secrets={}, server_id=server_id)
                config = MCPServerConfig(
                    id=server_id, name=entry.name, description=entry.description,
                    transport=MCPTransport.HTTP, url=info.internal_url,
                    enabled=True, managed=True, catalog_id=entry.id,
                )
            elif entry.npm_package and not entry.docker_image and has_npx:
                # Subprocess path
                config = MCPServerConfig(
                    id=server_id, name=entry.name, description=entry.description,
                    transport=MCPTransport.STDIO, command="npx", args=["-y", entry.npm_package],
                    enabled=True, managed=True, catalog_id=entry.id,
                )
            else:
                logger.info(
                    "MCP auto-deploy: skipping '%s' (docker_image=%s docker=%s, npm=%s npx=%s)",
                    entry.name, bool(entry.docker_image), has_docker,
                    bool(entry.npm_package), has_npx,
                )
                continue

            registry.register(config)
            registry.persist_config(config)
            deployed += 1
            logger.info("MCP auto-deploy: deployed '%s' (%s)", entry.name, config.transport.value)
        except Exception as e:
            logger.warning("MCP auto-deploy: failed to deploy %s: %s", entry.name, e)
            continue
    ```
  - Notes: The file lock, counter, and summary log are preserved from the existing function. `_warm_mcp_clients()` handles both transports automatically. Skipped entries are logged at `logger.info` (not debug) so operators can see why servers weren't deployed.

- [ ] Task 10: Update delete endpoint for unified secret cleanup
  - File: `engine/server/src/mcp/router.py`
  - Action: In `delete_mcp_server()` (line 394), replace the existing `config.secret_ref` cleanup (line 405-406) with prefix-based cleanup that covers both manual servers and catalog-deployed servers:
    ```python
    # Clean up all secrets for this server (covers both secret_ref and catalog secrets)
    from src.infra.secrets import secrets_store
    prefix = f"MCP_{server_id}_"
    for key in secrets_store.list_keys(prefix):
        secrets_store.delete(key)
    ```
    This replaces the existing `if config.secret_ref: secrets_store.delete(config.secret_ref)` block. The prefix scan catches all keys because manual servers store as `MCP_{id}_TOKEN` (matches prefix) and catalog servers store as `MCP_{id}_{key}` (also matches). For Docker-managed servers, keep the existing `manager.undeploy(server_id)` call. For STDIO servers, `registry.unregister()` triggers `client.disconnect()` which kills the subprocess via SDK.
  - Notes: Depends on Task 7a for the `list_keys(prefix)` API.

#### Phase 4: Health Checks & Rate Limiting

- [ ] Task 11: Add MCP health check background loop in API process
  - File: `engine/server/src/mcp/service.py`
  - Action: MCP clients only exist in the API process (the worker process has its own registry with no live connections — see `service.py` docstring lines 3-5). The health check MUST run in the API process, not the APScheduler worker. Add a background asyncio task launched from `startup_mcp()`:
    ```python
    _health_task: asyncio.Task | None = None

    async def _mcp_health_loop() -> None:
        """Periodically ping connected MCP servers (runs in API process)."""
        while True:
            await asyncio.sleep(120)
            registry = get_mcp_registry()
            for server in registry.list_servers():
                if not server.enabled:
                    continue
                client = registry._clients.get(server.id)
                if not client or not client.is_connected:
                    continue
                try:
                    await client.health_check()
                except Exception as e:
                    logger.warning("MCP health check failed for '%s': %s", server.name, e)
    ```
    In `startup_mcp()` (Phase 1, after `_warm_mcp_clients()`):
    ```python
    global _health_task
    _health_task = asyncio.create_task(_mcp_health_loop())
    ```
    In `shutdown_mcp()`:
    ```python
    global _health_task
    if _health_task:
        _health_task.cancel()
        _health_task = None
    ```
  - Notes: Only pings servers that already have an active client — does NOT trigger new connections. `health_check()` calls `session.send_ping()` which returns `EmptyResult` on success or raises on failure. The background task is cancelled on shutdown to prevent orphaned tasks.

- [ ] Task 12: Add per-server rate limiting on tool calls
  - File: `engine/server/src/mcp/tool_adapter.py`
  - Action: Add a single shared `_TokenBucket` instance that tracks all servers by `server_id` key. The `_TokenBucket` class is designed for multi-key tracking (like IP addresses in the middleware) — one instance with N keys is correct, not N instances with 1 key each:
    ```python
    from src.infra.rate_limit import _TokenBucket

    _MCP_TOOL_RATE = 30  # calls per minute per server
    _mcp_tool_bucket = _TokenBucket(rate=_MCP_TOOL_RATE / 60.0, capacity=_MCP_TOOL_RATE)
    ```
    In `MCPToolExecutor.execute()`, after resolving `server_id` from `self._map` and before `client.call_tool()`:
    ```python
    allowed, _ = _mcp_tool_bucket.allow(server_id)
    if not allowed:
        raise MCPClientError(
            f"Rate limit exceeded for MCP server (max {_MCP_TOOL_RATE}/min). "
            "Retry after a few seconds."
        )
    ```
  - Notes: Uses the existing `_TokenBucket` class from `rate_limit.py`. 30/min per server is a reasonable default — prevents LLM infinite loops while allowing normal usage. The bucket's internal cleanup logic handles stale server entries automatically. No Redis needed since tool calls are always dispatched from the API process. The error is caught by `tool_loop.py`'s `except Exception` handler and returned to the LLM as a tool result (does not crash the agent).

#### Phase 5: Frontend Updates

- [ ] Task 13: Update frontend types
  - File: `packages/api-client/src/types/settings.ts`
  - Action: Add `transport: 'http' | 'stdio'` to `MCPServer` interface.

- [ ] Task 14: Update McpServersTab for transport display
  - File: `apps/ops/src/components/configuration/McpServersTab.tsx`
  - Action:
    1. Show transport badge: "Sidecar" for `transport=http` + `managed=true`, "Subprocess" for `transport=stdio`, "Manual" for `managed=false`.
    2. Show catalog even when Docker is unavailable. npm-only entries (no `docker_image`) show as deployable. Docker-dependent entries show "Requires Docker" badge and are disabled.
    3. Deploy button sends the existing request — backend auto-detects transport.

### Acceptance Criteria

#### Build Infrastructure

- [ ] AC 1: `make build-mcp-sidecars` builds all 7 sidecar images without errors.
- [ ] AC 2: After building, deploying DuckDuckGo from catalog succeeds (no 502).

#### SDK Client

- [ ] AC 3: `MCPSDKClient` connects via HTTP (`streamable_http_client`) and discovers tools.
- [ ] AC 4: `MCPSDKClient` connects via stdio (`stdio_client`) and discovers tools.
- [ ] AC 5: `MCPSDKClient.disconnect()` cleanly tears down the `AsyncExitStack`.
- [ ] AC 6: Auto-reconnect works on HTTP connection failure.
- [ ] AC 7: All consumers work after alias swap — no `ImportError` on startup.

#### Hybrid Deployment

- [ ] AC 8: Catalog entries with `docker_image` deploy as Docker sidecars.
- [ ] AC 9: Catalog entries with `npm_package` only deploy as subprocess when Docker unavailable.
- [ ] AC 10: Entries requiring Docker show clear error when Docker unavailable.
- [ ] AC 11: Subprocess configs persist to disk and reconnect on engine restart.
- [ ] AC 12: Persisted STDIO JSON configs do NOT contain plaintext secrets in `env`.
- [ ] AC 13: `npx` not found → descriptive error message.
- [ ] AC 14: Deploying same `catalog_id` twice → 409 Conflict.

#### Health Checks & Rate Limiting

- [ ] AC 15: Health check job runs every 2 minutes, logs unhealthy MCP servers.
- [ ] AC 16: Tool calls exceeding 30/min per server return rate limit error.
- [ ] AC 17: Rate-limited tool calls do NOT crash the agent — error is returned to LLM as tool result.

#### Frontend

- [ ] AC 18: Server cards show transport badge ("Sidecar", "Subprocess", "Manual").
- [ ] AC 19: Catalog visible without Docker — npm-only entries deployable, Docker entries disabled.

#### End-to-End

- [ ] AC 20: Agent chat → LLM tool call → MCPToolExecutor → MCPSDKClient → MCP server → result → LLM response.

## Additional Context

### Dependencies

**Python (new):**
- `mcp>=1.26.0` — Official MCP Python SDK. Provides `ClientSession`, `stdio_client`, `streamable_http_client`, `StdioServerParameters`. Compatible with existing `httpx`, `pydantic`, `anyio`.

**Python (existing, leveraged):**
- No new dependencies for rate limiting (reuses `_TokenBucket` from `rate_limit.py`)
- No new dependencies for health checks (uses `asyncio.Task` in API process)

**npm (no changes).**

**Infrastructure:**
- Docker socket mounted on engine container (already done in `docker-compose.dev.yml` and `docker-compose.yml`).
- Node.js on host for subprocess mode (inside Docker, only needed for `mcp-node-proxy` image).

### Testing Strategy

**Unit tests:**
- `test_mcp_sdk_client.py`: Mock `streamable_http_client` and `stdio_client`. Verify `connect()`, `list_tools()` (snake_case: `.input_schema`), `call_tool()` (`.is_error`), `disconnect()`.
- `test_mcp_deploy_hybrid.py`: Test deploy endpoint with Docker entry → sidecar path, npm entry → subprocess path, docker_image+npm_package → sidecar path.
- `test_mcp_rate_limit.py`: Test shared `_TokenBucket` in `MCPToolExecutor.execute()` — verify 31st call in same minute raises `MCPClientError`. Verify different `server_id` keys are tracked independently.
- `test_import_paths.py`: Verify no remaining `from .client import` or `from src.mcp.client import`.

**Integration tests:**
- Deploy DuckDuckGo (Docker) and Fetch (subprocess) from catalog, verify tools discovered.
- Chat with agent using MCP tools, verify end-to-end tool execution.
- Health check loop pings connected servers in API process successfully.

### Notes

- **Phase ordering**: Phase 2 MUST complete before Phase 3. The old client raises `MCPConnectionError("No URL configured...")` for STDIO configs.
- **SDK Pydantic conventions**: ALL attribute access must use snake_case: `tool.input_schema` (not `inputSchema`), `result.is_error` (not `isError`).
- **Header passthrough**: `streamable_http_client` doesn't accept `headers` directly. Create a pre-configured `httpx.AsyncClient` and pass via `http_client` parameter.
- **Subprocess eligibility — strict rule**: Only entries with `npm_package` AND no `docker_image`. Entries like `puppeteer` have `server_command` calling npx but also `docker_image` — they need Chromium from the Docker image.
- **Windows compatibility**: SDK's `stdio_client` uses `create_windows_process()` with Job Objects on Windows (not `anyio.open_process()`). `npx` → `npx.cmd` resolution handled by SDK's `get_windows_executable_command()` via `shutil.which`.
- **Orphan subprocess behavior on crash**: On clean shutdown, `disconnect()` calls `AsyncExitStack.aclose()` which terminates the subprocess. On engine crash (SIGKILL, OOM), the subprocess becomes an orphan. The stdin pipe is closed by the kernel, and most MCP servers (those using the official `@modelcontextprotocol/sdk` `StdioServerTransport`) will exit on stdin EOF. However, third-party servers may not handle EOF gracefully, or may be blocked on a long-running operation. These orphans are stateless (`npx` servers) and will be replaced on next startup when `_warm_mcp_clients()` spawns fresh instances. Acceptable for development/on-premise — production deployments should monitor for stale `npx` processes.
- **Conditional warm-up sleep**: `_warm_mcp_clients()` currently has `await asyncio.sleep(10)` to let Docker sidecars start. After adding STDIO support, this sleep is pointless for subprocess servers (they are spawned on-demand in `connect()`). Make the sleep conditional: only if there are HTTP-transport servers to warm up. Add `from src.mcp.schemas import MCPTransport` and check `any(s.transport == MCPTransport.HTTP for s in servers)` before sleeping.
