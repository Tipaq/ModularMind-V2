"""Node creators for agent, tool, and subgraph node types."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ._utils import resolve_dot_path
from .state import GraphState

if TYPE_CHECKING:
    from src.mcp.registry import MCPRegistry

    from .interfaces import ConfigProviderProtocol, LLMProviderProtocol

NodeFn = Callable[[GraphState], Awaitable[dict[str, Any]]]

logger = logging.getLogger(__name__)



def _inject_context_layers(
    llm_messages: list,
    state: dict,
    agent_id: str | None = None,
) -> None:
    """Inject context layers (memory, RAG) from input_data into messages.

    If agent_id is provided, checks the per-agent context map first,
    then falls back to global _context_layers.
    """
    input_data = state.get("input_data", {})
    if agent_id:
        agent_context_map = input_data.get("_agent_context_map", {})
        layers = agent_context_map.get(agent_id, input_data.get("_context_layers", []))
    else:
        layers = input_data.get("_context_layers", [])

    for ctx in layers:
        if ctx and ctx.strip():
            llm_messages.append(SystemMessage(content=ctx))


def _extract_tool_publish_fn(
    config: RunnableConfig | None,
) -> Callable[[dict[str, Any]], Awaitable[None]] | None:
    """Extract an async publish_fn from LangGraph callbacks config.

    If an ExecutionTraceHandler is among the callbacks, return an async
    wrapper around its _publish method so that tool_loop can emit
    trace:tool_start / trace:tool_end events.
    """
    if not config:
        return None
    callbacks = config.get("callbacks", [])
    if callbacks is None:
        return None
    if hasattr(callbacks, "handlers"):
        handlers = callbacks.handlers
    elif isinstance(callbacks, list):
        handlers = callbacks
    else:
        return None
    for cb in handlers:
        if hasattr(cb, "publish") and hasattr(cb, "tokens"):
            sync_publish = cb.publish

            async def _async_publish(event: dict[str, Any], _pub=sync_publish) -> None:
                _pub(event)

            return _async_publish
    return None


async def create_agent_node(
    node_id: str,
    node_data: dict[str, Any],
    config_provider: ConfigProviderProtocol,
    llm_provider: LLMProviderProtocol,
    mcp_registry: MCPRegistry | None,
) -> NodeFn:
    """Create an agent node function."""
    agent_id = (
        node_data.get("agent_id")
        or node_data.get("config", {}).get("agentId")
        or node_data.get("config", {}).get("agent_id")
    )

    agent = None
    if agent_id:
        agent = await config_provider.get_agent_config(agent_id)

    model_id = agent.model_id if agent else "ollama:llama3.2"
    system_prompt = agent.system_prompt if agent else "You are a helpful assistant."

    mcp_tools: list[dict] = []
    mcp_executor = None
    if agent and mcp_registry:
        try:
            from src.tools.registry import resolve_mcp_tool_definitions

            mcp_tools, mcp_executor = await resolve_mcp_tool_definitions(
                agent.tool_categories, mcp_registry
            )
            if mcp_tools:
                logger.info(
                    "Graph agent '%s' (%s): bound %d MCP tools",
                    agent.name,
                    node_id,
                    len(mcp_tools),
                )
        except Exception as e:
            logger.warning(
                "Failed to discover MCP tools for graph agent '%s': %s",
                agent.name,
                e,
            )

    async def agent_node(state: GraphState, config: RunnableConfig) -> dict:
        effective_model = state.get("input_data", {}).get("_model_override") or model_id
        logger.info("Executing agent node: %s with model: %s", node_id, effective_model)

        configurable = config.get("configurable") or {}
        _started_fn = configurable.get("_node_started_fn")
        if _started_fn:
            _started_fn(node_id, effective_model)
        messages = state.get("messages", [])
        llm_messages = [SystemMessage(content=system_prompt)]
        _inject_context_layers(llm_messages, state, agent_id=agent_id)

        corrections = state.get("metadata", {}).get(f"corrections:{agent_id}", [])
        if corrections:
            correction_text = "Learn from these previous corrections:\n"
            for c in corrections[:3]:
                correction_text += (
                    f'- When you said: "{c["original"][:200]}"\n'
                    f'  Better response: "{c["correction"][:200]}"\n'
                )
            llm_messages.append(SystemMessage(content=correction_text))

        node_outputs = state.get("node_outputs", {})
        agent_input_msg = None
        if node_outputs:
            original_request = ""
            for m in messages:
                if hasattr(m, "type") and m.type == "human":
                    original_request = str(m.content)
                    break

            prior_outputs = []
            for _nid, out in node_outputs.items():
                resp = out.get("response", "") if isinstance(out, dict) else str(out)
                if resp:
                    prior_outputs.append(resp)

            context_msg = f"Original request: {original_request}"
            if prior_outputs:
                last_output = prior_outputs[-1]
                context_msg += f"\n\n--- Previous agent output ---\n{last_output}"
            agent_input_msg = HumanMessage(content=context_msg)
            llm_messages.append(agent_input_msg)
        else:
            llm_messages.extend(messages)

        execution_id = (config or {}).get("configurable", {}).get("thread_id")

        async def _is_cancelled() -> bool:
            if not execution_id:
                return False
            from src.executions.cancel import check_revoke_intent

            return await check_revoke_intent(execution_id) == "cancel"

        active_tools: list[dict] = list(mcp_tools)
        unified_executor = mcp_executor

        _graph_tool_cats = getattr(agent, "tool_categories", {}) if agent else {}
        extended_executor = None
        if _graph_tool_cats and any(_graph_tool_cats.values()):
            from src.tools.registry import resolve_tool_definitions

            extended_defs = resolve_tool_definitions(_graph_tool_cats)
            if extended_defs:
                active_tools.extend(extended_defs)
                logger.info(
                    "Graph agent '%s' (%s): %d extended tools from categories",
                    agent.name if agent else "?",
                    node_id,
                    len(extended_defs),
                )

        gateway_executor = None
        _needs_gateway = (
            bool(agent and agent.gateway_permissions)
            or _graph_tool_cats.get("filesystem")
            or _graph_tool_cats.get("shell")
            or _graph_tool_cats.get("network")
        )
        if _needs_gateway:
            from src.infra.config import get_settings as _get_settings

            _settings = _get_settings()
            if _settings.GATEWAY_ENABLED:
                from src.gateway.executor import GatewayToolExecutor
                from src.internal.auth import get_internal_bearer_token

                user_id = (state.get("metadata") or {}).get("user_id")
                gateway_executor = GatewayToolExecutor(
                    gateway_url=_settings.GATEWAY_URL,
                    agent_id=agent.id if agent else "",
                    execution_id=execution_id or "",
                    user_id=user_id or "",
                    internal_token=get_internal_bearer_token(),
                )

        if _graph_tool_cats and any(_graph_tool_cats.values()):
            from src.tools.executor import ExtendedToolExecutor, ToolExecutorDeps

            user_id = (state.get("metadata") or {}).get("user_id")
            from src.infra.database import async_session_maker

            executor_deps = ToolExecutorDeps(
                gateway_executor=gateway_executor,
                publish_fn=_extract_tool_publish_fn(config),
                execution_id=execution_id,
            )
            extended_executor = ExtendedToolExecutor(
                session_maker=async_session_maker,
                user_id=user_id or "",
                agent_id=agent.id if agent else "",
                deps=executor_deps,
            )

        if active_tools and (mcp_executor or gateway_executor or extended_executor):
            from src.graph_engine.builtin_tools import UnifiedToolExecutor

            unified_executor = UnifiedToolExecutor(
                lambda *a: (_ for _ in ()).throw(ValueError("No builtin tools in graph node")),
                mcp_executor,
                set(),
                gateway_executor=gateway_executor,
                extended_executor=extended_executor,
            )

        try:
            llm = await llm_provider.get_model(effective_model)

            if active_tools and unified_executor:
                from src.infra.config import get_settings

                from .tool_loop import ToolLoopConfig, run_tool_loop, try_bind_tools

                logger.info(
                    "Binding %d tools to %s for %s: %s",
                    len(active_tools),
                    effective_model,
                    node_id,
                    [t.get("function", {}).get("name", "?") for t in active_tools],
                )
                llm_with_tools, tools_bound = try_bind_tools(llm, active_tools)
                if tools_bound:
                    _tool_publish_fn = _extract_tool_publish_fn(config)

                    _search_tool_names = {"web_search"}
                    _tool_fn_names = {
                        t.get("function", {}).get("name", "") for t in active_tools
                    }
                    _has_search = bool(_search_tool_names & _tool_fn_names)

                    loop_config = ToolLoopConfig(
                        max_iterations=10,
                        tool_call_timeout=get_settings().MCP_TOOL_CALL_TIMEOUT,
                        min_tool_calls=3 if _has_search else 0,
                    )
                    response_text, _ = await run_tool_loop(
                        llm_with_tools,
                        llm_messages,
                        unified_executor,
                        config=loop_config,
                        cancel_check_fn=_is_cancelled,
                        publish_fn=_tool_publish_fn,
                    )
                else:
                    response = await llm.ainvoke(llm_messages, config=config)
                    response_text = response.content
            else:
                response = await llm.ainvoke(llm_messages, config=config)
                response_text = response.content

            logger.info("Agent %s response: %.100s...", node_id, response_text)
        except Exception as e:
            from src.executions.cancel import ExecutionCancelled
            from src.llm.errors import (
                ExecutionError,
                _extract_provider_key,
                classify_llm_error,
            )

            if isinstance(e, ExecutionCancelled):
                raise
            if isinstance(e, ExecutionError):
                raise
            provider_key = _extract_provider_key(effective_model) or "unknown"
            raise classify_llm_error(e, provider_key, effective_model) from e

        new_messages: list[BaseMessage] = []
        if agent_input_msg:
            new_messages.append(agent_input_msg)
        new_messages.append(AIMessage(content=response_text))

        return {
            "messages": new_messages,
            "current_node": node_id,
            "node_outputs": {node_id: {"response": response_text, "model": effective_model}},
        }

    return agent_node


async def create_tool_node(
    node_id: str,
    node_data: dict[str, Any],
    mcp_registry: MCPRegistry | None,
) -> NodeFn:
    """Create a tool node function."""
    config = node_data.get("config", {})
    tool_type = config.get("toolType", "function")
    tool_name = node_data.get("label", node_id)

    if tool_type == "mcp" and mcp_registry:
        mcp_server_id = config.get("mcpServerId")
        mcp_tool_name = config.get("mcpToolName")

        if not mcp_server_id or not mcp_tool_name:
            raise ValueError(
                f"Tool node '{node_id}' is type 'mcp' but missing "
                f"mcpServerId or mcpToolName in config"
            )

        arg_mappings = config.get("argumentMappings", {})
        static_args = config.get("staticArguments", {})
        registry = mcp_registry

        async def mcp_tool_node(state: GraphState, runnable_config: RunnableConfig) -> dict:
            from src.mcp import MCPToolCallRequest

            logger.info("Executing MCP tool: %s on server %s", mcp_tool_name, mcp_server_id)

            arguments = {}
            for param_name, source_path in arg_mappings.items():
                arguments[param_name] = resolve_dot_path(state, source_path)
            arguments.update(static_args)

            try:
                client = await registry.get_client(mcp_server_id)
                result = await client.call_tool(
                    MCPToolCallRequest(
                        server_id=mcp_server_id,
                        tool_name=mcp_tool_name,
                        arguments=arguments,
                    )
                )

                output_text = ""
                output_data = {}
                for item in result.content:
                    if item.get("type") == "text":
                        output_text += item.get("text", "")
                    elif item.get("type") == "resource":
                        output_data["resource"] = item

                output = {
                    "tool": mcp_tool_name,
                    "server": mcp_server_id,
                    "status": "error" if result.is_error else "success",
                    "output": output_text,
                    "data": output_data,
                }

            except Exception as e:
                logger.error("MCP tool %s failed: %s", mcp_tool_name, e)
                output = {
                    "tool": mcp_tool_name,
                    "server": mcp_server_id,
                    "status": "error",
                    "error": str(e),
                }

            return {
                "current_node": node_id,
                "node_outputs": {node_id: output},
            }

        return mcp_tool_node

    else:

        async def tool_node(state: GraphState, runnable_config: RunnableConfig) -> dict:
            logger.info("Executing tool node: %s (type=%s)", node_id, tool_type)
            result = {
                "tool": tool_name,
                "type": tool_type,
                "status": "executed",
                "output": "Tool output placeholder",
            }
            return {
                "current_node": node_id,
                "node_outputs": {node_id: result},
            }

        return tool_node


async def create_subgraph_node(
    node_id: str,
    node_data: dict[str, Any],
) -> NodeFn:
    """Create a subgraph node function."""
    subgraph_id = node_data.get("config", {}).get("subgraphId")

    async def subgraph_node(state: GraphState) -> dict:
        logger.warning("Subgraph node %s: nested execution not yet supported", node_id)
        raise NotImplementedError(
            f"Nested graph execution is not yet supported (subgraph_id={subgraph_id}). "
            "Use a top-level graph or agent delegation instead."
        )

    return subgraph_node
