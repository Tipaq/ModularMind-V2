"""
LangGraph Compiler for ModularMind Core.

Compiles graph configurations into executable LangGraph StateGraphs.
Supports: agent, tool, subgraph, condition, parallel, merge, loop nodes.
"""

import asyncio
import json as json_module
import logging
import re
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.mcp.registry import MCPRegistry

from src.graph_engine.state import GraphState

# A compiled node function: async (GraphState) -> dict
NodeFn = Callable[[GraphState], Awaitable[dict[str, Any]]]

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .condition_eval import build_condition_context, safe_eval_condition
from .interfaces import (
    AgentConfig,
    ConfigProviderProtocol,
    GraphConfig,
    LLMProviderProtocol,
)
from .state import GraphState

logger = logging.getLogger(__name__)


def _filter_mcp_for_agent(
    server_ids: list[str],
    agent: AgentConfig,
    registry: MCPRegistry,
) -> list[str]:
    """Filter MCP server IDs based on agent's gateway_permissions.

    Only includes servers whose catalog matches a permission the agent has:
    - browser.enabled → catalog_id in ("puppeteer", "brave-search")
    - GitHub and filesystem are now handled natively (not via MCP).

    Agents with no gateway_permissions get no MCP servers.
    """
    perms = agent.gateway_permissions or {}
    if not perms:
        return []

    filtered = []
    for sid in server_ids:
        server = registry.get_server(sid) if hasattr(registry, "get_server") else None
        if not server:
            continue

        catalog = getattr(server, "catalog_id", None) or ""

        if catalog in ("brave-search", "puppeteer") and perms.get("browser", {}).get("enabled"):
                filtered.append(sid)
        # Skip all other servers (github, filesystem, git, memory, shell)
        # These are handled natively by tool categories or gateway

    return filtered


def _resolve_dot_path(state: dict, path: str) -> Any:
    """Resolve a dot-separated path against graph state.

    Examples:
        "node_outputs.search.results" -> state["node_outputs"]["search"]["results"]
        "input_data.items" -> state["input_data"]["items"]
    """
    if not path:
        return None
    parts = path.split(".")
    current = state
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current


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
        ctx_map = input_data.get("_agent_context_map", {})
        layers = ctx_map.get(agent_id, input_data.get("_context_layers", []))
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
    # LangGraph may wrap callbacks in an AsyncCallbackManager;
    # extract the raw handler list from it.
    if hasattr(callbacks, "handlers"):
        handlers = callbacks.handlers
    elif isinstance(callbacks, list):
        handlers = callbacks
    else:
        return None
    for cb in handlers:
        if hasattr(cb, "publish") and hasattr(cb, "tokens"):
            sync_publish = cb.publish

            async def _async_publish(event: dict[str, Any], _pub=sync_publish) -> None:  # noqa: B023
                _pub(event)

            return _async_publish
    return None


class GraphCompiler:
    """Compiles graph configurations into LangGraph StateGraphs.

    This compiler transforms GraphConfig definitions into executable
    LangGraph workflows. It uses dependency injection for config and
    LLM providers to remain storage-agnostic.

    Supports parallel execution (asyncio.gather), enhanced condition
    routing (AST-based), loop/iteration, and merge strategies.
    """

    def __init__(
        self,
        config_provider: ConfigProviderProtocol,
        llm_provider: LLMProviderProtocol,
        mcp_registry: MCPRegistry | None = None,
    ):
        self.config_provider = config_provider
        self.llm_provider = llm_provider
        self.mcp_registry = mcp_registry
        self._compiled_node_funcs: dict[str, NodeFn] = {}

    def get_checkpointer(self) -> MemorySaver:
        """Create a memory checkpointer for state persistence.

        Note: For production use with persistence across restarts,
        this should be replaced with a persistent checkpointer.
        """
        return MemorySaver()

    async def compile_graph(self, graph: GraphConfig) -> CompiledStateGraph:
        """Compile a GraphConfig into an executable StateGraph.

        Handles parallel→branch→merge patterns by executing branch nodes
        internally via asyncio.gather (branches are NOT added to LangGraph).
        Loop nodes similarly execute their target internally.
        """
        workflow = StateGraph(GraphState)

        # Build lookup maps
        nodes_by_id = {node.id: node for node in graph.nodes}
        edges_by_source: dict[str, list] = {}
        for edge in graph.edges:
            source = edge.source
            if source not in edges_by_source:
                edges_by_source[source] = []
            edges_by_source[source].append(edge)

        # Pre-scan: identify parallel→branch→merge patterns
        parallel_branches: dict[str, list[str]] = {}
        parallel_merge: dict[str, str] = {}
        branch_node_ids: set[str] = set()

        for node in graph.nodes:
            if node.type == "parallel":
                branches = [e.target for e in edges_by_source.get(node.id, [])]
                parallel_branches[node.id] = branches
                branch_node_ids.update(branches)

                # Find merge node: common target of branch outgoing edges
                merge_candidates: set[str] = set()
                for bid in branches:
                    for edge in edges_by_source.get(bid, []):
                        target_node = nodes_by_id.get(edge.target)
                        if target_node and target_node.type == "merge":
                            merge_candidates.add(edge.target)
                if len(merge_candidates) == 1:
                    parallel_merge[node.id] = merge_candidates.pop()

        # Pre-scan: identify loop target nodes
        loop_target_ids: set[str] = set()
        for node in graph.nodes:
            if node.type == "loop":
                target_id = node.data.get("config", {}).get("target_node")
                if target_id:
                    loop_target_ids.add(target_id)

        # Compile node functions and add to LangGraph selectively
        self._compiled_node_funcs = {}

        for node in graph.nodes:
            if node.type in ("start", "end"):
                continue

            if node.id in branch_node_ids:
                # Branch nodes: compile function but DON'T add to LangGraph
                # They'll be called internally by the parallel node
                func = await self._create_node_function(node.id, node.type, node.data)
                self._compiled_node_funcs[node.id] = func

            elif node.id in loop_target_ids and node.id not in {
                n.id for n in graph.nodes if n.type == "loop"
            }:
                # Loop target nodes: compile but DON'T add to LangGraph
                # (unless the target is itself a regular node in the graph)
                func = await self._create_node_function(node.id, node.type, node.data)
                self._compiled_node_funcs[node.id] = func
                # Also add to LangGraph if it has edges from non-loop sources
                non_loop_sources = [
                    e
                    for e in graph.edges
                    if e.target == node.id
                    and nodes_by_id.get(e.source) is not None
                    and nodes_by_id[e.source].type != "loop"
                    and e.source not in branch_node_ids
                ]
                if non_loop_sources:
                    workflow.add_node(node.id, func)

            elif node.type == "parallel":
                func = self._create_parallel_node(
                    node.id, node.data, parallel_branches.get(node.id, [])
                )
                workflow.add_node(node.id, func)
                self._compiled_node_funcs[node.id] = func

            elif node.type == "loop":
                func = self._create_loop_node(node.id, node.data)
                workflow.add_node(node.id, func)
                self._compiled_node_funcs[node.id] = func

            else:
                func = await self._create_node_function(node.id, node.type, node.data)
                workflow.add_node(node.id, func)
                self._compiled_node_funcs[node.id] = func

        # Add edges
        for node in graph.nodes:
            outgoing = edges_by_source.get(node.id, [])

            if node.type == "start":
                if outgoing:
                    workflow.add_edge(START, outgoing[0].target)

            elif node.type == "end":
                continue

            elif node.type == "condition":
                self._add_conditional_edges(workflow, node.id, outgoing, nodes_by_id)

            elif node.type == "parallel":
                # Parallel → merge is a simple linear edge
                merge_id = parallel_merge.get(node.id)
                if merge_id:
                    workflow.add_edge(node.id, merge_id)
                else:
                    # No merge found — connect to first non-branch target
                    for edge in outgoing:
                        if edge.target not in branch_node_ids:
                            target_node = nodes_by_id.get(edge.target)
                            actual = (
                                END if target_node and target_node.type == "end" else edge.target
                            )
                            workflow.add_edge(node.id, actual)
                            break

            elif node.id in branch_node_ids:
                # Branch nodes are handled internally by parallel — skip
                continue

            else:
                for edge in outgoing:
                    target_node = nodes_by_id.get(edge.target)
                    actual = END if target_node and target_node.type == "end" else edge.target
                    # Skip edges to loop-only target nodes
                    if actual in loop_target_ids and actual not in {
                        n.id
                        for n in graph.nodes
                        if n.type not in ("start", "end") and n.id not in branch_node_ids
                    }:
                        continue
                    workflow.add_edge(node.id, actual)

        # Set entry point if specified
        if graph.entry_node_id:
            entry_node = nodes_by_id.get(graph.entry_node_id)
            if entry_node and entry_node.type != "start":
                workflow.set_entry_point(graph.entry_node_id)

        # Compile with checkpointing
        checkpointer = self.get_checkpointer()
        compiled = workflow.compile(
            checkpointer=checkpointer,
            interrupt_before=self._get_interrupt_nodes(graph),
        )

        return compiled

    async def compile_agent_graph(
        self,
        agent: AgentConfig,
        mcp_server_ids: list[str] | None = None,
    ) -> CompiledStateGraph:
        """Compile a single-agent graph, optionally with MCP tool calling.

        Args:
            agent: Agent configuration.
            mcp_server_ids: Optional list of MCP server UUIDs whose tools
                should be bound to the LLM for native function calling.
        """
        workflow = StateGraph(GraphState)

        model_id = agent.model_id
        system_prompt = agent.system_prompt

        # Pre-discover MCP tools (auto-discover from all enabled servers if none specified)
        lc_tools: list[dict] = []
        tool_executor = None
        if not mcp_server_ids and self.mcp_registry:
            mcp_server_ids = [s.id for s in self.mcp_registry.list_servers() if s.enabled]
        if mcp_server_ids and self.mcp_registry:
            mcp_server_ids = _filter_mcp_for_agent(mcp_server_ids, agent, self.mcp_registry)
        if mcp_server_ids and self.mcp_registry:
            try:
                from src.mcp.tool_adapter import discover_and_convert

                lc_tools, tool_executor = await discover_and_convert(
                    self.mcp_registry,
                    mcp_server_ids,
                )
                # Apply per-agent tool whitelist if configured
                _perms = agent.gateway_permissions or {}
                _tool_filter = _perms.get("mcp_tool_filter")
                if _tool_filter and lc_tools:
                    lc_tools = [
                        t for t in lc_tools
                        if any(
                            t.get("function", {}).get("name", "").endswith(f"_{tn}")
                            for tn in _tool_filter
                        )
                    ]
                if lc_tools:
                    logger.info(
                        "Agent '%s': bound %d MCP tools from %d servers",
                        agent.name,
                        len(lc_tools),
                        len(mcp_server_ids),
                    )
            except Exception as e:  # MCP discovery raises heterogeneous errors
                logger.warning("Failed to discover MCP tools for agent '%s': %s", agent.name, e)

        # Append built-in tool definitions (static — don't need user_id)
        from src.graph_engine.builtin_tools import (
            BUILTIN_TOOL_NAMES,
            get_builtin_tool_definitions,
        )

        lc_tools.extend(get_builtin_tool_definitions())

        # Capture for closure
        _lc_tools = lc_tools
        _mcp_executor = tool_executor

        async def agent_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            # Allow per-conversation model override via input_data
            effective_model = state.get("input_data", {}).get("_model_override") or model_id
            logger.info("Executing agent: %s with model: %s", agent.name, effective_model)
            messages = state.get("messages", [])
            llm_messages = [SystemMessage(content=system_prompt)]
            _inject_context_layers(llm_messages, state)
            llm_messages.extend(messages)

            # Build cancellation check from execution_id (thread_id)
            _exec_id = (config or {}).get("configurable", {}).get("thread_id")

            async def _is_cancelled() -> bool:
                if not _exec_id:
                    return False
                from src.executions.cancel import check_revoke_intent

                return await check_revoke_intent(_exec_id) == "cancel"

            # Build unified tool executor lazily (user_id only available at runtime)
            user_id = (state.get("metadata") or {}).get("user_id")
            active_tools = list(_lc_tools)
            unified_executor = _mcp_executor

            # Gateway tool executor — needed for filesystem, shell, network tools.
            gateway_executor = None
            _tool_cats = getattr(agent, "tool_categories", {})
            _needs_gateway = (
                bool(agent.gateway_permissions)
                or _tool_cats.get("filesystem")
                or _tool_cats.get("shell")
                or _tool_cats.get("network")
            )
            if _needs_gateway:
                from src.infra.config import get_settings as _get_settings

                _settings = _get_settings()
                if _settings.GATEWAY_ENABLED:
                    from src.gateway.executor import GatewayToolExecutor
                    from src.gateway.tool_definitions import get_gateway_tool_definitions
                    from src.internal.auth import get_internal_bearer_token

                    if agent.gateway_permissions:
                        gateway_tool_defs = get_gateway_tool_definitions(
                            agent.gateway_permissions
                        )
                        active_tools.extend(gateway_tool_defs)
                    gateway_executor = GatewayToolExecutor(
                        gateway_url=_settings.GATEWAY_URL,
                        agent_id=agent.id,
                        execution_id=_exec_id or "",
                        user_id=user_id or "",
                        internal_token=get_internal_bearer_token(),
                    )

            # Extended tools (memory, knowledge, file_storage, scheduling, etc.)
            extended_executor = None
            tool_categories = getattr(agent, "tool_categories", {})
            if tool_categories and any(tool_categories.values()):
                from src.tools.registry import (
                    resolve_registered_custom_tools,
                    resolve_tool_definitions,
                )

                extended_defs = resolve_tool_definitions(tool_categories)
                if extended_defs:
                    active_tools.extend(extended_defs)
                    logger.info(
                        "Agent '%s': %d extended tools from %d categories",
                        agent.name, len(extended_defs),
                        sum(1 for v in tool_categories.values() if v),
                    )

                # Load registered custom tools from DB as callable LLM tools
                if tool_categories.get("custom_tools"):
                    from src.infra.database import async_session_maker as _asm

                    registered_defs = await resolve_registered_custom_tools(agent.id, _asm)
                    if registered_defs:
                        active_tools.extend(registered_defs)
                        logger.info(
                            "Agent '%s': %d registered custom tools loaded",
                            agent.name, len(registered_defs),
                        )

            if user_id:
                from src.graph_engine.builtin_tools import (
                    UnifiedToolExecutor,
                    create_builtin_executor,
                )
                from src.infra.database import async_session_maker

                # Build extended executor if any categories are enabled
                if tool_categories and any(tool_categories.values()):
                    from src.tools.executor import ExtendedToolExecutor, ToolExecutorDeps

                    executor_deps = ToolExecutorDeps(
                        gateway_executor=gateway_executor,
                        publish_fn=_extract_tool_publish_fn(config),
                    )
                    extended_executor = ExtendedToolExecutor(
                        session_maker=async_session_maker,
                        user_id=user_id,
                        agent_id=agent.id,
                        deps=executor_deps,
                    )

                builtin_exec = create_builtin_executor(user_id, async_session_maker)
                unified_executor = UnifiedToolExecutor(
                    builtin_exec,
                    _mcp_executor,
                    BUILTIN_TOOL_NAMES,
                    gateway_executor=gateway_executor,
                    extended_executor=extended_executor,
                )
            else:
                # No user_id — filter out built-in tool defs to avoid LLM calling them
                active_tools = [
                    t
                    for t in active_tools
                    if t.get("function", {}).get("name") not in BUILTIN_TOOL_NAMES
                ]
                logger.debug("No user_id in state.metadata — built-in tools disabled")
                # Still create UnifiedToolExecutor for gateway/scheduled task tools
                if gateway_executor:
                    from src.graph_engine.builtin_tools import UnifiedToolExecutor

                    unified_executor = UnifiedToolExecutor(
                        lambda *a: (_ for _ in ()).throw(ValueError("No builtin tools")),
                        _mcp_executor,
                        set(),
                        gateway_executor=gateway_executor,
                        )

            try:
                llm = await self.llm_provider.get_model(effective_model)

                # Raw LLM mode — no tools, direct invocation only
                if agent.id == "__raw__":
                    active_tools = []

                if active_tools and unified_executor:
                    from src.infra.config import get_settings

                    from .tool_loop import ToolLoopConfig, run_tool_loop, try_bind_tools

                    llm_with_tools, tools_bound = try_bind_tools(llm, active_tools)
                    if tools_bound:
                        _tool_publish_fn = _extract_tool_publish_fn(config)

                        _search_tool_names = {
                            "web_search",
                        }
                        _tool_fn_names = {
                            t.get("function", {}).get("name", "")
                            for t in active_tools
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

                logger.info("Agent response: %.100s...", response_text)
            except Exception as e:  # LLM providers raise heterogeneous errors
                from src.executions.cancel import ExecutionCancelled

                if isinstance(e, ExecutionCancelled):
                    raise  # Propagate cancellation to the worker
                logger.error("Agent LLM error: %s", e)
                response_text = f"[Error] Failed to get response from {effective_model}: {str(e)}"

            return {
                "messages": messages + [AIMessage(content=response_text)],
                "current_node": "agent",
                "node_outputs": {"agent": {"response": response_text, "model": effective_model}},
            }

        workflow.add_node("agent", agent_node)
        workflow.add_edge(START, "agent")
        workflow.add_edge("agent", END)

        checkpointer = self.get_checkpointer()
        return workflow.compile(checkpointer=checkpointer)

    # -------------------------------------------------------------------------
    # Node function dispatcher
    # -------------------------------------------------------------------------

    # Registry mapping node types to their creator methods.
    # Entries whose creator is async are awaited; sync ones are called directly.
    _NODE_CREATORS: dict[str, str] = {
        "agent": "_create_agent_node",
        "tool": "_create_tool_node",
        "subgraph": "_create_subgraph_node",
        "condition": "_create_condition_node",
        "parallel": "_create_parallel_node",
        "merge": "_create_merge_node",
        "loop": "_create_loop_node",
        "supervisor": "_create_supervisor_node",
        "approval": "_create_approval_node",
    }

    async def _create_node_function(
        self,
        node_id: str,
        node_type: str,
        node_data: dict[str, Any],
    ) -> NodeFn:
        """Create a node function based on node type."""
        creator_name = self._NODE_CREATORS.get(node_type)
        if creator_name is None:
            return self._create_passthrough_node(node_id)

        creator = getattr(self, creator_name)

        # parallel node has a different signature (extra edges arg)
        if node_type == "parallel":
            return self._create_parallel_node(node_id, node_data, [])

        result = creator(node_id, node_data)
        # Await coroutines (async creators like agent, tool, subgraph, supervisor)
        if asyncio.iscoroutine(result):
            return await result
        return result

    # -------------------------------------------------------------------------
    # Agent node
    # -------------------------------------------------------------------------

    async def _create_agent_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create an agent node function."""
        agent_id = (
            node_data.get("agent_id")
            or node_data.get("config", {}).get("agentId")
            or node_data.get("config", {}).get("agent_id")
        )

        agent = None
        if agent_id:
            agent = await self.config_provider.get_agent_config(agent_id)

        model_id = agent.model_id if agent else "ollama:llama3.2"
        system_prompt = agent.system_prompt if agent else "You are a helpful assistant."

        # Pre-discover MCP tools at compile time (same pattern as compile_agent_graph)
        mcp_tools: list[dict] = []
        mcp_executor = None
        if agent and self.mcp_registry:
            all_server_ids = [
                s.id for s in self.mcp_registry.list_servers() if s.enabled
            ]
            if all_server_ids:
                filtered_ids = _filter_mcp_for_agent(all_server_ids, agent, self.mcp_registry)
                if filtered_ids:
                    try:
                        from src.mcp.tool_adapter import discover_and_convert

                        mcp_tools, mcp_executor = await discover_and_convert(
                            self.mcp_registry, filtered_ids,
                        )
                        # Apply per-agent tool whitelist if configured
                        _agent_perms = agent.gateway_permissions or {}
                        tool_filter = _agent_perms.get("mcp_tool_filter")
                        if tool_filter and mcp_tools:
                            mcp_tools = [
                                t for t in mcp_tools
                                if any(
                                    t.get("function", {}).get("name", "").endswith(f"_{tn}")
                                    for tn in tool_filter
                                )
                            ]
                        if mcp_tools:
                            logger.info(
                                "Graph agent '%s' (%s): bound %d MCP tools from %d servers",
                                agent.name, node_id, len(mcp_tools), len(filtered_ids),
                            )
                    except Exception as e:
                        logger.warning(
                            "Failed to discover MCP tools for graph agent '%s': %s",
                            agent.name, e,
                        )

        async def agent_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            # Allow per-conversation model override via input_data
            effective_model = state.get("input_data", {}).get("_model_override") or model_id
            logger.info("Executing agent node: %s with model: %s", node_id, effective_model)

            # Signal that this agent node has started (for real-time Activity tracking)
            configurable = (config.get("configurable") or {}) if config else {}
            _started_fn = configurable.get("_node_started_fn")
            if _started_fn:
                _started_fn(node_id, effective_model)
            messages = state.get("messages", [])
            llm_messages = [SystemMessage(content=system_prompt)]
            _inject_context_layers(llm_messages, state, agent_id=agent_id)

            # Inject few-shot corrections if available in metadata
            corrections = state.get("metadata", {}).get(f"corrections:{agent_id}", [])
            if corrections:
                correction_text = "Learn from these previous corrections:\n"
                for c in corrections[:3]:  # Max 3 few-shot examples
                    correction_text += (
                        f'- When you said: "{c["original"][:200]}"\n'
                        f'  Better response: "{c["correction"][:200]}"\n'
                    )
                llm_messages.append(SystemMessage(content=correction_text))

            # In a graph pipeline, build contextual input from previous agent outputs
            # so each agent receives the prior agent's work as its input
            node_outputs = state.get("node_outputs", {})
            agent_input_msg = None
            if node_outputs:
                # Get the original user request (first human message)
                original_request = ""
                for m in messages:
                    if hasattr(m, "type") and m.type == "human":
                        original_request = str(m.content)
                        break

                # Build pipeline context from previous agents' outputs
                prior_outputs = []
                for _nid, out in node_outputs.items():
                    resp = out.get("response", "") if isinstance(out, dict) else str(out)
                    if resp:
                        prior_outputs.append(resp)

                # Give this agent: original request + previous agent output as context
                context_msg = f"Original request: {original_request}"
                if prior_outputs:
                    last_output = prior_outputs[-1]
                    context_msg += f"\n\n--- Previous agent output ---\n{last_output}"
                agent_input_msg = HumanMessage(content=context_msg)
                llm_messages.append(agent_input_msg)
            else:
                # First agent in pipeline — just pass the original messages
                llm_messages.extend(messages)

            # Build cancellation check from execution_id
            _exec_id = (config or {}).get("configurable", {}).get("thread_id")

            async def _is_cancelled() -> bool:
                if not _exec_id:
                    return False
                from src.executions.cancel import check_revoke_intent

                return await check_revoke_intent(_exec_id) == "cancel"

            # Build tool executor for this agent (MCP + gateway)
            active_tools: list[dict] = list(mcp_tools)
            unified_executor = mcp_executor

            gateway_executor = None
            _graph_tool_cats = getattr(agent, "tool_categories", {}) if agent else {}
            _graph_needs_gw = (
                bool(agent and agent.gateway_permissions)
                or _graph_tool_cats.get("filesystem")
                or _graph_tool_cats.get("shell")
                or _graph_tool_cats.get("network")
            )
            if _graph_needs_gw:
                from src.infra.config import get_settings as _get_settings

                _settings = _get_settings()
                if _settings.GATEWAY_ENABLED:
                    from src.gateway.executor import GatewayToolExecutor
                    from src.gateway.tool_definitions import get_gateway_tool_definitions
                    from src.internal.auth import get_internal_bearer_token

                    if agent and agent.gateway_permissions:
                        gateway_tool_defs = get_gateway_tool_definitions(
                            agent.gateway_permissions
                        )
                        active_tools.extend(gateway_tool_defs)
                    user_id = (state.get("metadata") or {}).get("user_id")
                    gateway_executor = GatewayToolExecutor(
                        gateway_url=_settings.GATEWAY_URL,
                        agent_id=agent.id if agent else "",
                        execution_id=_exec_id or "",
                        user_id=user_id or "",
                        internal_token=get_internal_bearer_token(),
                    )

            # Build unified executor combining MCP + gateway
            if active_tools and (mcp_executor or gateway_executor):
                from src.graph_engine.builtin_tools import UnifiedToolExecutor

                unified_executor = UnifiedToolExecutor(
                    lambda *a: (_ for _ in ()).throw(
                        ValueError("No builtin tools in graph node")
                    ),
                    mcp_executor,
                    set(),
                    gateway_executor=gateway_executor,
                )

            try:
                llm = await self.llm_provider.get_model(effective_model)

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

                        _search_tool_names = {
                            "web_search",
                        }
                        _tool_fn_names = {
                            t.get("function", {}).get("name", "")
                            for t in active_tools
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
            except Exception as e:  # LLM providers raise heterogeneous errors
                from src.executions.cancel import ExecutionCancelled

                if isinstance(e, ExecutionCancelled):
                    raise  # Propagate cancellation to the worker
                logger.error("Agent %s LLM error: %s", node_id, e)
                response_text = f"[Error] Failed to get response from {effective_model}: {str(e)}"

            # Build returned messages: include contextual input if present
            new_messages = list(messages)
            if agent_input_msg:
                new_messages.append(agent_input_msg)
            new_messages.append(AIMessage(content=response_text))

            return {
                "messages": new_messages,
                "current_node": node_id,
                "node_outputs": {
                    **state.get("node_outputs", {}),
                    node_id: {"response": response_text, "model": effective_model},
                },
            }

        return agent_node

    # -------------------------------------------------------------------------
    # Tool node
    # -------------------------------------------------------------------------

    async def _create_tool_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a tool node function.

        Dispatches based on tool configuration:
        - MCP tools (config.toolType == "mcp"): calls MCP server via MCPClient
        - Other tools: placeholder (future implementation)
        """
        config = node_data.get("config", {})
        tool_type = config.get("toolType", "function")
        tool_name = node_data.get("label", node_id)

        if tool_type == "mcp" and self.mcp_registry:
            mcp_server_id = config.get("mcpServerId")
            mcp_tool_name = config.get("mcpToolName")

            if not mcp_server_id or not mcp_tool_name:
                raise ValueError(
                    f"Tool node '{node_id}' is type 'mcp' but missing "
                    f"mcpServerId or mcpToolName in config"
                )

            # Capture in closure
            arg_mappings = config.get("argumentMappings", {})
            static_args = config.get("staticArguments", {})
            registry = self.mcp_registry

            async def mcp_tool_node(
                state: GraphState, runnable_config: RunnableConfig | None = None
            ) -> dict:
                from src.mcp import MCPToolCallRequest

                logger.info("Executing MCP tool: %s on server %s", mcp_tool_name, mcp_server_id)

                # Build arguments from mappings + static args
                arguments = {}
                for param_name, source_path in arg_mappings.items():
                    arguments[param_name] = _resolve_dot_path(state, source_path)
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

                    # Extract text content from MCP response
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

                except Exception as e:  # MCP tool calls raise heterogeneous errors
                    logger.error("MCP tool %s failed: %s", mcp_tool_name, e)
                    output = {
                        "tool": mcp_tool_name,
                        "server": mcp_server_id,
                        "status": "error",
                        "error": str(e),
                    }

                return {
                    "current_node": node_id,
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: output,
                    },
                }

            return mcp_tool_node

        else:
            # Non-MCP tool (function, api, custom) — placeholder for future impl
            async def tool_node(
                state: GraphState, runnable_config: RunnableConfig | None = None
            ) -> dict:
                logger.info("Executing tool node: %s (type=%s)", node_id, tool_type)
                result = {
                    "tool": tool_name,
                    "type": tool_type,
                    "status": "executed",
                    "output": "Tool output placeholder",
                }
                return {
                    "current_node": node_id,
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: result,
                    },
                }

            return tool_node

    # -------------------------------------------------------------------------
    # Subgraph node
    # -------------------------------------------------------------------------

    async def _create_subgraph_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a subgraph node function."""
        subgraph_id = node_data.get("config", {}).get("subgraphId")

        async def subgraph_node(state: GraphState) -> dict:
            logger.warning("Subgraph node %s: nested execution not yet supported", node_id)
            raise NotImplementedError(
                f"Nested graph execution is not yet supported (subgraph_id={subgraph_id}). "
                "Use a top-level graph or agent delegation instead."
            )

        return subgraph_node

    # -------------------------------------------------------------------------
    # Condition node
    # -------------------------------------------------------------------------

    def _create_condition_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a condition evaluation node."""

        async def condition_node(state: GraphState) -> dict:
            logger.info("Evaluating condition node: %s", node_id)
            return {"current_node": node_id}

        return condition_node

    # -------------------------------------------------------------------------
    # Parallel node (asyncio.gather)
    # -------------------------------------------------------------------------

    def _create_parallel_node(
        self,
        node_id: str,
        node_data: dict[str, Any],
        branch_node_ids: list[str] | None = None,
    ) -> NodeFn:
        """Create a parallel node that executes branches via asyncio.gather.

        Branch node functions are called internally — they are NOT separate
        LangGraph nodes. Results are stored in state.branch_results for the
        downstream merge node to consume.
        """
        branch_ids = branch_node_ids or []

        async def parallel_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            logger.info("Parallel %s: executing %d branches", node_id, len(branch_ids))

            async def run_branch(bid: str) -> dict[str, Any]:
                func = self._compiled_node_funcs.get(bid)
                if not func:
                    return {"branch_id": bid, "error": f"Branch node '{bid}' not found"}
                try:
                    result = await func(state, config)
                    return {
                        "branch_id": bid,
                        "output": result.get("node_outputs", {}).get(bid, {}),
                        "messages": result.get("messages", []),
                    }
                except Exception as e:  # Branch execution wraps LLM/tool calls
                    logger.error("Branch %s failed: %s", bid, e)
                    return {"branch_id": bid, "error": str(e)}

            results = await asyncio.gather(*[run_branch(bid) for bid in branch_ids])

            return {
                "current_node": node_id,
                "branch_results": list(results),
                "node_outputs": {
                    **state.get("node_outputs", {}),
                    node_id: {"branches": len(results)},
                },
            }

        return parallel_node

    # -------------------------------------------------------------------------
    # Merge node (fan-in)
    # -------------------------------------------------------------------------

    def _create_merge_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a merge node that aggregates parallel branch results.

        Strategies:
        - combine_outputs (default): merge all branch outputs into one dict
        - concat_messages: append all branch messages to state
        - first_non_empty: take first successful branch output
        - all: keep all branch results as-is
        """
        strategy = node_data.get("config", {}).get("merge_strategy", "combine_outputs")

        async def merge_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            branch_results = state.get("branch_results", [])
            logger.info(
                "Merge %s: %d branches, strategy=%s", node_id, len(branch_results), strategy
            )

            merged_outputs: dict[str, Any] = {}
            merged_messages: list = []

            for br in branch_results:
                if br.get("error"):
                    merged_outputs[br["branch_id"]] = {"error": br["error"]}
                else:
                    merged_outputs[br["branch_id"]] = br.get("output", {})
                    merged_messages.extend(br.get("messages", []))

            if strategy == "concat_messages":
                return {
                    "current_node": node_id,
                    "messages": state.get("messages", []) + merged_messages,
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: {"merged": len(branch_results)},
                    },
                    "branch_results": [],
                }

            elif strategy == "first_non_empty":
                for br in branch_results:
                    output = br.get("output", {})
                    if output and not br.get("error"):
                        return {
                            "current_node": node_id,
                            "node_outputs": {
                                **state.get("node_outputs", {}),
                                node_id: output,
                            },
                            "branch_results": [],
                        }
                return {"current_node": node_id, "branch_results": []}

            elif strategy == "all":
                return {
                    "current_node": node_id,
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: {"branches": branch_results},
                    },
                    "branch_results": [],
                }

            else:  # combine_outputs (default)
                combined: dict[str, Any] = {}
                for _bid, output in merged_outputs.items():
                    if isinstance(output, dict) and "error" not in output:
                        combined.update(output)
                return {
                    "current_node": node_id,
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: combined,
                    },
                    "branch_results": [],
                }

        return merge_node

    # -------------------------------------------------------------------------
    # Approval gate node
    # -------------------------------------------------------------------------

    def _create_approval_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a human-in-the-loop approval gate.

        Pauses execution, publishes the previous agent's output as an
        ``approval_required`` SSE event, and polls Redis until the user
        approves or rejects (or timeout is reached).

        Config keys (in ``node_data.config``):
        - approvalTimeout: seconds to wait (default 3600 = 1h)
        - message: optional message template shown to the user
        """
        node_config = node_data.get("config", {})
        timeout_seconds = node_config.get("approvalTimeout", 0)  # 0 = no timeout
        gate_message = node_config.get("message", "Review the plan above and approve to continue.")

        async def approval_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            exec_id = (config or {}).get("configurable", {}).get("thread_id")
            if not exec_id:
                logger.warning("Approval node %s: no execution_id, skipping gate", node_id)
                return {"current_node": node_id}

            # Gather the plan from previous agent outputs
            node_outputs = state.get("node_outputs", {})
            plan_parts = []
            for nid, out in node_outputs.items():
                resp = out.get("response", "") if isinstance(out, dict) else str(out)
                if resp:
                    plan_parts.append(f"**{nid}**:\n{resp}")
            plan_summary = "\n\n---\n\n".join(plan_parts) if plan_parts else "(no plan)"

            logger.info("Approval gate %s: requesting approval for execution %s", node_id, exec_id)

            import asyncio as _asyncio
            import json as _json

            from src.infra.redis import get_redis_client as _get_redis

            # Use Redis for the entire approval flow to avoid asyncpg session
            # conflicts (the worker's DB session is tied to the outer generator).
            # 1. Set AWAITING_APPROVAL status + publish SSE event
            # 2. Poll Redis key for decision
            # 3. Reset status on approve, or cancel on reject

            stream_key = f"exec_stream:{exec_id}"

            r = await _get_redis()
            try:
                # Use Redis exclusively for approval signalling — DB operations
                # from inside LangGraph nodes cause asyncpg pool/event-loop
                # contention that blocks silently.
                #
                # Flow:
                # 1. Set Redis key  approval_decision:{exec_id} = "pending"
                # 2. Publish approval_required SSE event
                # 3. Poll Redis key until "approved" or "rejected"
                # The approve/reject API endpoints will SET this Redis key.

                decision_key = f"approval_decision:{exec_id}"
                await r.set(decision_key, "pending")
                # Also store node_id so the API endpoints can reference it
                await r.set(f"approval_node:{exec_id}", node_id)

                # Publish approval_required to SSE stream.
                # Use type="step" + event="approval_required" to match the
                # format of other step events (step_started, step_completed).
                # The SSE normalizer emits event: step which the frontend
                # already listens to.
                await r.xadd(stream_key, {"data": _json.dumps({
                    "type": "step",
                    "event": "approval_required",
                    "node_id": node_id,
                    "execution_id": exec_id,
                    "message": gate_message,
                    "plan": plan_summary[:4000],
                    "timeout_seconds": timeout_seconds,
                })})

                logger.info(
                    "Approval gate %s: published approval_required event", node_id
                )

                # 2. Poll Redis for approval decision
                poll_interval = 2.0
                decision = None

                while True:
                    await _asyncio.sleep(poll_interval)

                    # Check cancellation
                    revoke = await r.get(f"revoke_intent:{exec_id}")
                    if revoke and revoke.decode() == "cancel":
                        from src.executions.cancel import ExecutionCancelled
                        raise ExecutionCancelled()

                    # Check approval decision
                    val = await r.get(decision_key)
                    if val:
                        val_str = val.decode() if isinstance(val, bytes) else val
                        if val_str == "approved":
                            decision = "approved"
                            break
                        elif val_str == "rejected":
                            decision = "rejected"
                            break

                # 3. Handle decision
                if decision == "approved":
                    logger.info(
                        "Approval gate %s: APPROVED, continuing", node_id
                    )
                    await r.xadd(stream_key, {"data": _json.dumps({
                        "type": "step",
                        "event": "approval_granted",
                        "node_id": node_id,
                        "execution_id": exec_id,
                    })})
                    # Clean up Redis keys
                    await r.delete(decision_key, f"approval_node:{exec_id}")
                else:
                    logger.info(
                        "Approval gate %s: REJECTED, stopping", node_id
                    )
                    await r.delete(decision_key, f"approval_node:{exec_id}")
                    from src.executions.cancel import ExecutionCancelled
                    raise ExecutionCancelled()
            finally:
                await r.aclose()

            return {
                "current_node": node_id,
                "node_outputs": {
                    **state.get("node_outputs", {}),
                    node_id: {"response": f"Approved by user. {gate_message}"},
                },
            }

        return approval_node

    # -------------------------------------------------------------------------
    # Loop node
    # -------------------------------------------------------------------------

    def _create_loop_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a loop node for iterating over collections.

        Modes:
        - batch: call target once with full collection
        - item: call target per-item with asyncio.Semaphore concurrency control
        """
        config = node_data.get("config", {})
        source_path = config.get("source", "")
        mode = config.get("mode", "batch")
        max_concurrency = config.get("max_concurrency", 5)
        item_var = config.get("item_variable", "current_item")
        target_node_id = config.get("target_node")

        async def loop_node(
            state: GraphState, runnable_config: RunnableConfig | None = None
        ) -> dict:
            collection = _resolve_dot_path(state, source_path)
            if collection is None:
                collection = []
            if not isinstance(collection, list):
                collection = list(collection) if hasattr(collection, "__iter__") else [collection]

            logger.info(
                "Loop %s: %d items, mode=%s, target=%s",
                node_id,
                len(collection),
                mode,
                target_node_id,
            )

            target_func = self._compiled_node_funcs.get(target_node_id or "")
            if not target_func:
                raise ValueError(f"Loop target '{target_node_id}' not found in compiled functions")

            if mode == "batch":
                batch_state = {
                    **state,
                    "input_data": {**state.get("input_data", {}), "items": collection},
                }
                result = await target_func(batch_state, runnable_config)
                results = [result]
            else:  # item mode
                sem = asyncio.Semaphore(max_concurrency)

                async def process_item(idx: int, item: Any) -> Any:
                    async with sem:
                        item_state = {
                            **state,
                            "input_data": {
                                **state.get("input_data", {}),
                                item_var: item,
                                "loop_index": idx,
                            },
                        }
                        return await target_func(item_state, runnable_config)

                results = await asyncio.gather(
                    *[process_item(i, item) for i, item in enumerate(collection)],
                    return_exceptions=True,
                )

            processed = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    processed.append({"index": i, "error": str(r)})
                elif isinstance(r, dict):
                    node_output = r.get("node_outputs", {}).get(target_node_id, r)
                    processed.append({"index": i, **node_output})
                else:
                    processed.append({"index": i, "output": r})

            return {
                "current_node": node_id,
                "node_outputs": {
                    **state.get("node_outputs", {}),
                    node_id: {"results": processed, "total": len(collection)},
                },
                "loop_state": {
                    "items": collection,
                    "results": processed,
                    "mode": mode,
                    "node_id": node_id,
                },
            }

        return loop_node

    # -------------------------------------------------------------------------
    # Supervisor node (LLM-based routing + delegation)
    # -------------------------------------------------------------------------

    async def _create_supervisor_node(self, node_id: str, node_data: dict[str, Any]) -> NodeFn:
        """Create a supervisor node that routes to agents via LLM.

        The supervisor:
        1. Lists available worker agents (all or a configured subset)
        2. Asks a supervisor LLM to pick the best agent(s) for the task
        3. Invokes selected agent(s) via AgentInvoker
        4. Optionally reviews the response before returning
        """
        from .agent_invoker import AgentInvoker

        config = node_data.get("config", {})
        supervisor_agent_id = config.get("supervisorAgentId")
        worker_agent_ids = config.get("workerAgentIds")
        delegation_mode = config.get("delegationMode", "single")
        review_response = config.get("reviewResponse", False)
        max_delegations = config.get("maxDelegations", 3)
        custom_prompt = config.get("supervisorPrompt")

        invoker = AgentInvoker(self.config_provider, self.llm_provider)

        async def supervisor_node(state: GraphState, config: RunnableConfig | None = None) -> dict:
            logger.info("Supervisor %s: analyzing input for routing", node_id)

            # 1. Get available workers
            if worker_agent_ids:
                workers = []
                for wid in worker_agent_ids:
                    agent = await self.config_provider.get_agent_config(wid)
                    if agent:
                        workers.append(agent)
            else:
                workers = await self.config_provider.list_agents()

            if not workers:
                return {
                    "current_node": node_id,
                    "error": "No worker agents available",
                    "node_outputs": {
                        **state.get("node_outputs", {}),
                        node_id: {"error": "No worker agents available"},
                    },
                }

            # 2. Build routing prompt
            agent_catalog = "\n".join(
                f"- ID: {a.id} | Name: {a.name} | "
                f"Capabilities: {', '.join(a.capabilities) or 'general'} | "
                f"Description: {a.description}"
                for a in workers
            )

            user_message = state.get("input_prompt", "")
            last_messages = state.get("messages", [])[-3:]
            context_str = "\n".join(
                f"{'User' if hasattr(m, 'type') and m.type == 'human' else 'AI'}: {m.content}"
                for m in last_messages
            )

            routing_prompt = custom_prompt or (
                "You are a supervisor agent. Analyze the user's request and decide "
                "which agent(s) should handle it.\n\n"
                "Available agents:\n{agents}\n\n"
                "Recent conversation:\n{context}\n\n"
                "User request: {request}\n\n"
                "Respond with JSON only:\n"
                '{{"selected_agents": [{{"id": "agent-uuid", "instruction": "what to do"}}], '
                '"reasoning": "why these agents"}}'
            )

            routing_prompt = routing_prompt.format(
                agents=agent_catalog,
                context=context_str or "(no prior context)",
                request=user_message,
            )

            # 3. Ask supervisor LLM for routing decision
            if supervisor_agent_id:
                routing_result = await invoker.invoke(
                    supervisor_agent_id,
                    state,
                    override_prompt=routing_prompt,
                    config=config,
                )
            else:
                llm = await self.llm_provider.get_model(workers[0].model_id)
                response = await llm.ainvoke(
                    [
                        SystemMessage(content="You are a routing supervisor."),
                        AIMessage(content=routing_prompt),
                    ],
                    config=config,
                )
                routing_result = {"response": response.content}

            # 4. Parse routing decision
            response_text = routing_result["response"]
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            selected = []

            if json_match:
                try:
                    decision = json_module.loads(json_match.group())
                    raw_selected = decision.get("selected_agents", [])[:max_delegations]
                    valid_worker_ids = {str(w.id) for w in workers}
                    selected = [s for s in raw_selected if s.get("id") in valid_worker_ids]
                    if len(selected) < len(raw_selected):
                        logger.warning(
                            "Supervisor %s: filtered %d invalid agent IDs",
                            node_id,
                            len(raw_selected) - len(selected),
                        )
                except json_module.JSONDecodeError:
                    logger.warning("Supervisor %s: failed to parse routing JSON", node_id)

            if not selected:
                selected = [{"id": str(workers[0].id), "instruction": user_message}]

            # 5. Delegate to selected agents
            delegation_results = []
            frozen_state = dict(state)

            if delegation_mode == "single" or len(selected) == 1:
                agent_sel = selected[0]
                try:
                    result = await invoker.invoke(
                        agent_sel["id"],
                        frozen_state,
                        override_prompt=agent_sel.get("instruction", user_message),
                        config=config,
                    )
                    delegation_results.append(
                        {
                            "agent_id": agent_sel["id"],
                            "agent_name": result.get("agent_name", ""),
                            "response": result["response"],
                            "instruction": agent_sel.get("instruction", ""),
                        }
                    )
                except Exception as e:  # LLM providers raise heterogeneous errors
                    logger.error("Supervisor %s: single delegation failed: %s", node_id, e)
                    delegation_results.append(
                        {
                            "agent_id": agent_sel["id"],
                            "error": str(e),
                        }
                    )
            else:

                async def delegate(sel: dict) -> dict:
                    try:
                        result = await invoker.invoke(
                            sel["id"],
                            frozen_state,
                            override_prompt=sel.get("instruction", user_message),
                            config=config,
                        )
                        return {
                            "agent_id": sel["id"],
                            "agent_name": result.get("agent_name", ""),
                            "response": result["response"],
                            "instruction": sel.get("instruction", ""),
                        }
                    except Exception as e:  # LLM providers raise heterogeneous errors
                        return {"agent_id": sel["id"], "error": str(e)}

                delegation_results = list(await asyncio.gather(*[delegate(s) for s in selected]))

            # 6. Optional: supervisor reviews the response(s)
            final_response = ""
            if review_response and supervisor_agent_id:
                review_prompt = (
                    "Review and synthesize these agent responses:\n\n"
                    + "\n\n".join(
                        f"Agent {r.get('agent_name', r.get('agent_id', ''))}: "
                        f"{r.get('response', r.get('error', ''))}"
                        for r in delegation_results
                    )
                    + f"\n\nOriginal request: {user_message}\n\n"
                    "Provide a final, coherent response to the user."
                )
                review_result = await invoker.invoke(
                    supervisor_agent_id,
                    state,
                    override_prompt=review_prompt,
                    config=config,
                )
                final_response = review_result["response"]
            else:
                responses = [r["response"] for r in delegation_results if "response" in r]
                final_response = (
                    responses[0]
                    if len(responses) == 1
                    else "\n\n---\n\n".join(responses)
                    if responses
                    else "No agent produced a response."
                )

            # 7. Build return state
            return {
                "messages": state.get("messages", []) + [AIMessage(content=final_response)],
                "current_node": node_id,
                "node_outputs": {
                    **state.get("node_outputs", {}),
                    node_id: {
                        "routing_decision": selected,
                        "delegation_results": delegation_results,
                        "final_response": final_response,
                        "agents_used": [r.get("agent_id") for r in delegation_results],
                    },
                },
                "delegation_context": {
                    "supervisor_node": node_id,
                    "delegations": delegation_results,
                    "routing_history": state.get("delegation_context", {}).get(
                        "routing_history", []
                    )
                    + [
                        {"node": node_id, "agents": [r.get("agent_id") for r in delegation_results]}
                    ],
                },
            }

        return supervisor_node

    # -------------------------------------------------------------------------
    # Passthrough node
    # -------------------------------------------------------------------------

    def _create_passthrough_node(self, node_id: str) -> NodeFn:
        """Create a passthrough node."""

        async def passthrough_node(state: GraphState) -> dict:
            return {"current_node": node_id}

        return passthrough_node

    # -------------------------------------------------------------------------
    # Conditional edges (AST-based routing)
    # -------------------------------------------------------------------------

    def _add_conditional_edges(
        self,
        workflow: StateGraph,
        node_id: str,
        outgoing_edges: list,
        nodes_by_id: dict,
    ) -> None:
        """Add conditional edges with AST-based expression evaluation.

        Supports:
        - Python expressions: "score > 0.8", "status == 'approved'"
        - Backward compat: "true", "yes", "1" always match
        - Default/else: "default", "else", or edges without condition
        - Context: flattened node_outputs + metadata
        """
        condition_map: list[tuple[str, str]] = []  # ordered (expr, target)
        default_target = END

        for edge in outgoing_edges:
            target = edge.target
            edge_data = edge.data or {}
            condition = edge_data.get("condition")

            target_node = nodes_by_id.get(target)
            actual_target = END if target_node and target_node.type == "end" else target

            if condition and condition.lower() not in ("default", "else"):
                condition_map.append((condition, actual_target))
            else:
                default_target = actual_target

        def route_condition(state: GraphState) -> str:
            ctx = build_condition_context(state)
            for expr, target in condition_map:
                if safe_eval_condition(expr, ctx):
                    return target
            return default_target

        all_targets = list(set(t for _, t in condition_map) | {default_target})
        workflow.add_conditional_edges(node_id, route_condition, all_targets)

    # -------------------------------------------------------------------------
    # Interrupt nodes (human-in-the-loop)
    # -------------------------------------------------------------------------

    def _get_interrupt_nodes(self, graph: GraphConfig) -> list[str]:
        """Get list of nodes that should interrupt for human input."""
        interrupt_nodes = []
        for node in graph.nodes:
            config = node.data.get("config", {})
            if config.get("requiresApproval"):
                interrupt_nodes.append(node.id)
        return interrupt_nodes
