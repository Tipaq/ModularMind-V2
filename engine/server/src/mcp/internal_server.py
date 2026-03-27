"""Internal MCP server — exposes ModularMind tools to the Claude Bridge CLI.

The CLI discovers tools via MCP and executes them autonomously.
Execution context (user_id, agent_id) is set before each bridge call
via set_execution_context() and cleared after.

The MCP endpoint lives at /mcp on the engine, reachable by the bridge
container via http://engine:8000/mcp on the Docker network.
"""

import json
import logging
from typing import Any

from starlette.applications import Starlette

logger = logging.getLogger(__name__)

# Execution context — set by the caller before invoking the bridge CLI.
# The worker processes graph nodes sequentially, so a simple ContextVar
# (or module-level dict keyed by nonce) is safe.
_active_contexts: dict[str, dict[str, Any]] = {}

MCP_CTX_PREFIX = "mcp_ctx:"
MCP_CTX_TTL = 600


async def create_mcp_context(
    user_id: str,
    agent_id: str,
    tool_categories: dict[str, bool],
    execution_id: str | None = None,
) -> str:
    """Store execution context in Redis and return a nonce.

    The nonce is passed to the bridge CLI as MM_MCP_CTX env var.
    The MCP tool handlers resolve it to get user/agent context.
    """
    import secrets

    from src.infra.redis_utils import get_redis

    nonce = secrets.token_urlsafe(16)
    ctx = {
        "user_id": user_id,
        "agent_id": agent_id,
        "tool_categories": tool_categories,
        "execution_id": execution_id,
    }
    redis = await get_redis()
    await redis.set(f"{MCP_CTX_PREFIX}{nonce}", json.dumps(ctx), ex=MCP_CTX_TTL)
    _active_contexts[nonce] = ctx
    logger.info("MCP context created: %s (user=%s, agent=%s)", nonce, user_id, agent_id)
    return nonce


async def clear_mcp_context(nonce: str) -> None:
    """Remove execution context after bridge call completes."""
    from src.infra.redis_utils import get_redis

    _active_contexts.pop(nonce, None)
    try:
        redis = await get_redis()
        await redis.delete(f"{MCP_CTX_PREFIX}{nonce}")
    except Exception:
        pass


async def _resolve_context(nonce: str) -> dict[str, Any] | None:
    """Resolve context from local cache or Redis."""
    ctx = _active_contexts.get(nonce)
    if ctx:
        return ctx
    try:
        from src.infra.redis_utils import get_redis

        redis = await get_redis()
        raw = await redis.get(f"{MCP_CTX_PREFIX}{nonce}")
        if raw:
            return json.loads(raw)
    except Exception:
        logger.exception("Failed to resolve MCP context %s", nonce)
    return None


def _build_executor(ctx: dict[str, Any]):
    """Build an ExtendedToolExecutor from resolved context."""
    from src.infra.db import async_session_factory
    from src.tools.executor import ExtendedToolExecutor, ToolExecutorDeps

    return ExtendedToolExecutor(
        session_maker=async_session_factory,
        user_id=ctx["user_id"],
        agent_id=ctx["agent_id"],
        deps=ToolExecutorDeps(execution_id=ctx.get("execution_id")),
    )


def _get_all_tool_definitions() -> list[dict[str, Any]]:
    """Load all tool definitions from all categories."""
    from src.tools.registry import get_category_registry

    registry = get_category_registry()
    tools: list[dict[str, Any]] = []
    for category, definition_fn in registry.items():
        try:
            tools.extend(definition_fn())
        except Exception:
            logger.exception("Failed to load tools for category %s", category)
    return tools


def _create_mcp_server():
    """Create FastMCP server with all ModularMind tools."""
    from mcp.server.fastmcp import FastMCP

    server = FastMCP(
        name="modularmind",
        instructions=(
            "ModularMind platform tools. Every tool call MUST include "
            "a '_ctx' parameter with the execution nonce from the "
            "MM_MCP_CTX environment variable."
        ),
    )

    tool_defs = _get_all_tool_definitions()
    for tool_def in tool_defs:
        func = tool_def.get("function", {})
        _register_tool(server, func.get("name", ""), func.get("description", ""))

    logger.info("Internal MCP: %d tools registered", len(tool_defs))
    return server


def _register_tool(server, tool_name: str, description: str) -> None:
    """Register one tool. The handler resolves context from _ctx nonce."""

    async def handler(**kwargs: Any) -> str:
        nonce = kwargs.pop("_ctx", "")
        if not nonce:
            return "Error: _ctx parameter required (use $MM_MCP_CTX)"
        ctx = await _resolve_context(nonce)
        if not ctx:
            return f"Error: unknown context nonce '{nonce}'"
        executor = _build_executor(ctx)
        return await executor.execute(tool_name, kwargs)

    full_desc = f"{description} [Requires _ctx=$MM_MCP_CTX]"
    server.add_tool(handler, name=tool_name, description=full_desc)


_app: Starlette | None = None


def get_mcp_app() -> Starlette:
    """Return ASGI app for mounting at /mcp in FastAPI."""
    global _app
    if _app is None:
        mcp = _create_mcp_server()
        _app = mcp.streamable_http_app()
    return _app
