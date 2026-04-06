"""
Tool response handling — TOOL_RESPONSE strategy execution with discovery meta-tools.
"""

import json
import logging
import time
from typing import Any

import httpx
import redis.asyncio as aioredis
from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.provider import ConfigProvider
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH
from src.llm.base import LLMProvider
from src.llm.errors import ExecutionError, to_sse_payload

from .context_retriever import get_memory_context
from .schemas import RoutingDecision

logger = logging.getLogger(__name__)

TOOL_TEMPERATURE = 0.3
TOOL_LOOP_MAX_ITERATIONS = 10
MAX_TOOLS_IN_EVENT = 20
EVENT_BUFFER_TTL_SECONDS = 300


async def handle_tool_response(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    conv_config: dict[str, Any],
    db: AsyncSession,
    config_provider: ConfigProvider,
    llm_provider: LLMProvider,
    redis_client: aioredis.Redis,
    exec_service,
    resolve_model_name_fn,
    handle_direct_response_fn,
) -> dict[str, Any]:
    """Handle TOOL_RESPONSE — supervisor answers using discovered tools.

    Uses two meta-tools (search_tools + use_tool) to give the supervisor
    access to all tool sources without binding dozens of tools directly.
    """
    from src.graph_engine.tool_loop import ToolLoopConfig, run_tool_loop, try_bind_tools

    execution, publish_fn = await setup_tool_execution(
        conv_id,
        content,
        user_id,
        db,
        redis_client,
        exec_service,
    )

    discovery_defs, discovery_executor = await create_discovery_tools(
        user_id,
        conv_config,
        publish_fn,
        execution.id,
    )

    _, model_name = resolve_model_name_fn(conv_config)

    try:
        llm = await llm_provider.get_model(model_name, temperature=TOOL_TEMPERATURE)
        llm_with_tools, tools_bound = try_bind_tools(llm, discovery_defs)

        if not tools_bound:
            logger.info("Model %s doesn't support tools, falling back", model_name)
            return await handle_direct_response_fn(
                decision,
                conv_id,
                content,
                user_id,
                conv_config,
            )

        memory_context = await get_memory_context(user_id)
        llm_messages = compose_tool_messages(
            conv_config,
            content,
            memory_context=memory_context,
        )

        step_start = time.perf_counter()

        await publish_tool_step_started(
            publish_fn,
            execution.id,
            model_name,
            discovery_defs,
        )

        from src.infra.config import get_settings

        loop_config = ToolLoopConfig(
            max_iterations=TOOL_LOOP_MAX_ITERATIONS,
            tool_call_timeout=get_settings().MCP_TOOL_CALL_TIMEOUT,
        )
        response_text, _ = await run_tool_loop(
            llm_with_tools,
            llm_messages,
            discovery_executor,
            config=loop_config,
            publish_fn=publish_fn,
        )

        step_duration_ms = int((time.perf_counter() - step_start) * 1000)

        await finalize_tool_response(
            conv_id,
            execution,
            response_text,
            publish_fn,
            db,
            step_duration_ms=step_duration_ms,
        )

        return {
            "execution_id": execution.id,
            "tool_response_inline": True,
        }

    except ExecutionError as err:
        logger.error("TOOL_RESPONSE LLM error: %s", err.user_message)
        await publish_fn(to_sse_payload(err) | {"execution_id": execution.id})
        return await handle_direct_response_fn(
            decision,
            conv_id,
            content,
            user_id,
            conv_config,
        )
    except (
        httpx.HTTPError,
        ConnectionError,
        TimeoutError,
        ValueError,
        RuntimeError,
        KeyError,
    ) as e:
        logger.error("TOOL_RESPONSE execution failed: %s", e, exc_info=True)
        await publish_fn(
            {
                "type": "error",
                "event": "run_failed",
                "execution_id": execution.id,
                "message": str(e),
            }
        )
        return await handle_direct_response_fn(
            decision,
            conv_id,
            content,
            user_id,
            conv_config,
        )


async def create_discovery_tools(
    user_id: str,
    conv_config: dict[str, Any],
    publish_fn: Any,
    execution_id: str,
) -> tuple[list[dict[str, Any]], Any]:
    """Build the two meta-tools and their unified executor.

    Returns (tool_definitions, ToolDiscoveryExecutor).
    """
    from src.graph_engine.builtin_tools import (
        BUILTIN_TOOL_NAMES,
        create_builtin_executor,
    )
    from src.infra.config import get_settings
    from src.infra.database import async_session_maker
    from src.tools.discovery import ToolDiscoveryExecutor, get_discovery_tool_definitions
    from src.tools.executor import ExtendedToolExecutor, ToolExecutorDeps

    allowed_categories = conv_config.get("supervisor_tool_categories")

    mcp_tools, mcp_executor, mcp_by_server = await discover_mcp_tools(conv_config)

    executor_deps = ToolExecutorDeps(publish_fn=publish_fn)
    extended_executor = ExtendedToolExecutor(
        session_maker=async_session_maker,
        user_id=user_id,
        agent_id="supervisor",
        deps=executor_deps,
    )

    # Gateway tools (only if gateway is configured)
    gateway_executor = None
    gateway_tool_defs: list[dict[str, Any]] = []
    settings = get_settings()
    if settings.GATEWAY_URL:
        from src.gateway.executor import GatewayToolExecutor
        from src.internal.auth import get_internal_bearer_token
        from src.tools.categories.network import get_network_tool_definitions
        from src.tools.categories.shell import get_shell_tool_definitions

        gateway_tool_defs = [
            *get_shell_tool_definitions(),
            *get_network_tool_definitions(),
        ]
        gateway_executor = GatewayToolExecutor(
            gateway_url=settings.GATEWAY_URL,
            agent_id="supervisor",
            execution_id=execution_id,
            user_id=user_id,
            internal_token=get_internal_bearer_token(),
        )

    # Builtin tools
    builtin_fn = create_builtin_executor(user_id, async_session_maker)

    discovery_executor = ToolDiscoveryExecutor(
        extended_executor=extended_executor,
        mcp_executor=mcp_executor,
        gateway_executor=gateway_executor,
        builtin_fn=builtin_fn,
        builtin_names=BUILTIN_TOOL_NAMES,
        mcp_tool_defs_by_server=mcp_by_server,
        gateway_tool_defs=gateway_tool_defs,
        allowed_categories=allowed_categories,
    )

    return get_discovery_tool_definitions(), discovery_executor


async def discover_mcp_tools(
    conv_config: dict[str, Any],
) -> tuple[list | None, Any, dict[str, list[dict[str, Any]]]]:
    """Discover and convert MCP tools for tool-calling execution.

    Returns:
        Tuple of (lc_tools, executor, tools_by_server_name).
        tools_by_server_name maps server display names to their LC tool defs.
    """
    from src.mcp.service import get_mcp_registry
    from src.mcp.tool_adapter import discover_and_convert

    registry = get_mcp_registry()
    servers = [s for s in registry.list_servers() if s.enabled]
    if not servers:
        logger.debug("No enabled MCP servers for supervisor tools")
        return None, None, {}

    server_id_to_name = {s.id: s.name for s in servers}
    lc_tools, tool_executor = await discover_and_convert(
        registry,
        [s.id for s in servers],
    )

    if not lc_tools or not tool_executor:
        logger.debug("No MCP tools discovered for supervisor")
        return None, None, {}

    tools_by_server_name: dict[str, list[dict[str, Any]]] = {}
    for ns_name, (server_id, _real_name) in tool_executor._map.items():
        server_name = server_id_to_name.get(server_id, server_id[:8])
        tool_def = next((t for t in lc_tools if t["function"]["name"] == ns_name), None)
        if tool_def:
            tools_by_server_name.setdefault(server_name, []).append(tool_def)

    return lc_tools, tool_executor, tools_by_server_name


async def setup_tool_execution(
    conv_id: str,
    content: str,
    user_id: str,
    db: AsyncSession,
    redis_client: aioredis.Redis,
    exec_service,
) -> tuple[Any, Any]:
    """Create execution record and build a publish_fn for streaming."""
    execution = await exec_service.start_supervisor_execution(
        conversation_id=conv_id,
        input_prompt=content,
        user_id=user_id,
    )
    await db.commit()

    exec_channel = f"execution:{execution.id}"
    seq = 0

    stream_key = f"exec_stream:{execution.id}"

    async def publish_fn(event: dict[str, Any]) -> None:
        nonlocal seq
        seq += 1
        event["seq"] = seq
        event["execution_id"] = execution.id
        event_json = json.dumps(event, default=str)
        await redis_client.publish(exec_channel, event_json)
        await redis_client.rpush(f"buffer:{execution.id}", event_json)
        await redis_client.expire(f"buffer:{execution.id}", EVENT_BUFFER_TTL_SECONDS)
        await redis_client.xadd(stream_key, {"data": event_json})
        if event.get("type") in ("complete", "error"):
            await redis_client.expire(stream_key, 300)

    return execution, publish_fn


def compose_tool_messages(
    conv_config: dict[str, Any],
    content: str,
    memory_context: str = "",
) -> list[Any]:
    """Compose layered LLM messages for tool-calling (identity + personality + task)."""
    from langchain_core.messages import SystemMessage

    from src.prompt_layers import (
        LayerType,
        PromptComposer,
        PromptLayer,
        get_supervisor_identity,
        get_supervisor_personality,
        get_tool_task,
    )

    composer = PromptComposer()
    composer.add(
        PromptLayer(LayerType.IDENTITY, get_supervisor_identity(), "supervisor_identity")
    )
    personality = conv_config.get("supervisor_prompt") or get_supervisor_personality()
    composer.add(PromptLayer(LayerType.PERSONALITY, personality, "supervisor_personality"))
    composer.add(PromptLayer(LayerType.TASK, get_tool_task(), "tool_task"))
    messages = composer.build()
    if memory_context:
        messages.append(SystemMessage(content=memory_context))
    messages.append(HumanMessage(content=content))
    return messages


async def publish_tool_step_started(
    publish_fn,
    execution_id: str,
    model_name: str,
    lc_tools: list,
) -> None:
    """Publish step_started event with tool info for UI display."""
    tool_names = [getattr(t, "name", str(t)) for t in lc_tools]
    await publish_fn(
        {
            "type": "step",
            "event": "step_started",
            "run_id": execution_id,
            "node_id": "supervisor_tools",
            "node_type": "supervisor_tools",
            "status": "running",
            "agent_name": "Supervisor (Tools)",
            "model": model_name,
            "tools": tool_names[:MAX_TOOLS_IN_EVENT],
            "is_ephemeral": False,
        }
    )


async def finalize_tool_response(
    conv_id: str,
    execution,
    response_text: str,
    publish_fn,
    db: AsyncSession,
    *,
    step_duration_ms: int | None = None,
) -> None:
    """Save response, update execution status, and publish completion events."""
    from src.conversations.models import MessageRole
    from src.conversations.service import ConversationService
    from src.executions.models import ExecutionStatus

    conv_service = ConversationService(db)
    await conv_service.add_message(
        conversation_id=conv_id,
        role=MessageRole.ASSISTANT,
        content=response_text,
        metadata={
            "routing": "tool_response",
            "strategy": "TOOL_RESPONSE",
            "execution_id": execution.id,
        },
    )

    execution.status = ExecutionStatus.COMPLETED
    execution.output_data = {"response": response_text}
    await db.commit()

    await publish_fn(
        {
            "type": "step",
            "event": "step_completed",
            "run_id": execution.id,
            "node_id": "supervisor_tools",
            "node_type": "agent",
            "status": "completed",
            "duration_ms": step_duration_ms,
            "output_data": {"response": response_text[:OUTPUT_TRUNCATION_LENGTH]},
        }
    )
    await publish_fn(
        {
            "type": "complete",
            "event": "run_completed",
            "execution_id": execution.id,
            "run_id": execution.id,
            "status": "completed",
            "duration_ms": step_duration_ms,
            "output": {"response": response_text},
            "output_data": {"response": response_text},
        }
    )
