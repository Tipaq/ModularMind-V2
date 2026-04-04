"""
LangGraph Compiler for ModularMind Core.

Compiles graph configurations into executable LangGraph StateGraphs.
Supports: agent, tool, subgraph, condition, parallel, merge, loop nodes.

Node creation logic is split into separate modules:
- nodes_agent: agent, tool, subgraph
- nodes_flow: condition, parallel, merge, loop, conditional edges
- nodes_supervisor: supervisor, approval
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.mcp.registry import MCPRegistry

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .interfaces import (
    AgentConfig,
    ConfigProviderProtocol,
    GraphConfig,
    LLMProviderProtocol,
)
from .nodes_agent import (
    _extract_tool_publish_fn,
    _inject_context_layers,
    create_agent_node,
    create_subgraph_node,
    create_tool_node,
)
from .nodes_flow import (
    add_conditional_edges,
    create_condition_node,
    create_loop_node,
    create_merge_node,
    create_parallel_node,
)
from .nodes_supervisor import create_approval_node, create_supervisor_node
from .state import GraphState

logger = logging.getLogger(__name__)

# A compiled node function: async (GraphState) -> dict
NodeFn = Callable[[GraphState], Awaitable[dict[str, Any]]]


async def _maybe_scope_mcp(
    mcp_executor: Any,
    mcp_registry: MCPRegistry,
    project_id: str,
    session_maker: Any,
) -> Any:
    """Wrap MCP executor with project-scoped repo filtering if applicable."""
    from sqlalchemy import select

    from src.infra.config import settings
    from src.projects.models import ProjectRepository

    fastcode_server = mcp_registry.get_server_by_name(settings.FASTCODE_MCP_SERVER_NAME)
    if not fastcode_server:
        return mcp_executor

    async with session_maker() as session:
        result = await session.execute(
            select(ProjectRepository.repo_identifier).where(
                ProjectRepository.project_id == project_id
            )
        )
        project_repos = [r[0] for r in result.all()]

    if not project_repos:
        return mcp_executor

    from src.mcp.scoped_executor import ScopedMCPToolExecutor

    return ScopedMCPToolExecutor(mcp_executor, project_repos, fastcode_server.id)


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
        """Create a memory checkpointer for state persistence."""
        return MemorySaver()

    async def compile_graph(self, graph: GraphConfig) -> CompiledStateGraph:
        """Compile a GraphConfig into an executable StateGraph.

        Handles parallel->branch->merge patterns by executing branch nodes
        internally via asyncio.gather (branches are NOT added to LangGraph).
        Loop nodes similarly execute their target internally.
        """
        workflow = StateGraph(GraphState)

        nodes_by_id = {node.id: node for node in graph.nodes}
        edges_by_source: dict[str, list] = {}
        for edge in graph.edges:
            source = edge.source
            if source not in edges_by_source:
                edges_by_source[source] = []
            edges_by_source[source].append(edge)

        # Pre-scan: identify parallel->branch->merge patterns
        parallel_branches: dict[str, list[str]] = {}
        parallel_merge: dict[str, str] = {}
        branch_node_ids: set[str] = set()

        for node in graph.nodes:
            if node.type == "parallel":
                branches = [e.target for e in edges_by_source.get(node.id, [])]
                parallel_branches[node.id] = branches
                branch_node_ids.update(branches)

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
                func = await self._create_node_function(node.id, node.type, node.data)
                self._compiled_node_funcs[node.id] = func

            elif node.id in loop_target_ids and node.id not in {
                n.id for n in graph.nodes if n.type == "loop"
            }:
                func = await self._create_node_function(node.id, node.type, node.data)
                self._compiled_node_funcs[node.id] = func
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
                func = create_parallel_node(
                    node.id,
                    node.data,
                    parallel_branches.get(node.id, []),
                    self._compiled_node_funcs,
                )
                workflow.add_node(node.id, func)
                self._compiled_node_funcs[node.id] = func

            elif node.type == "loop":
                func = create_loop_node(node.id, node.data, self._compiled_node_funcs)
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
                add_conditional_edges(workflow, node.id, outgoing, nodes_by_id)

            elif node.type == "parallel":
                merge_id = parallel_merge.get(node.id)
                if merge_id:
                    workflow.add_edge(node.id, merge_id)
                else:
                    for edge in outgoing:
                        if edge.target not in branch_node_ids:
                            target_node = nodes_by_id.get(edge.target)
                            actual = (
                                END if target_node and target_node.type == "end" else edge.target
                            )
                            workflow.add_edge(node.id, actual)
                            break

            elif node.id in branch_node_ids:
                continue

            else:
                for edge in outgoing:
                    target_node = nodes_by_id.get(edge.target)
                    actual = END if target_node and target_node.type == "end" else edge.target
                    if actual in loop_target_ids and actual not in {
                        n.id
                        for n in graph.nodes
                        if n.type not in ("start", "end") and n.id not in branch_node_ids
                    }:
                        continue
                    workflow.add_edge(node.id, actual)

        if graph.entry_node_id:
            entry_node = nodes_by_id.get(graph.entry_node_id)
            if entry_node and entry_node.type != "start":
                workflow.set_entry_point(graph.entry_node_id)

        checkpointer = self.get_checkpointer()
        compiled = workflow.compile(
            checkpointer=checkpointer,
            interrupt_before=self._get_interrupt_nodes(graph),
        )

        return compiled

    async def compile_agent_graph(
        self,
        agent: AgentConfig,
        llm_kwargs: dict | None = None,
    ) -> CompiledStateGraph:
        """Compile a single-agent graph with tool calling.

        MCP tools are resolved from the agent's ``tool_categories``
        (keys starting with ``mcp:``).
        """
        effective_llm_kwargs = llm_kwargs or {}
        workflow = StateGraph(GraphState)

        model_id = agent.model_id
        system_prompt = agent.system_prompt

        lc_tools: list[dict] = []
        tool_executor = None
        mcp_tools_by_server: dict[str, list[dict]] = {}
        if self.mcp_registry:
            try:
                from src.tools.registry import resolve_mcp_tool_definitions

                lc_tools, tool_executor, mcp_tools_by_server = (
                    await resolve_mcp_tool_definitions(
                        agent.tool_categories, self.mcp_registry
                    )
                )
                if lc_tools:
                    logger.info(
                        "Agent '%s': bound %d MCP tools",
                        agent.name,
                        len(lc_tools),
                    )
            except Exception as e:
                logger.warning("Failed to discover MCP tools for agent '%s': %s", agent.name, e)

        from src.graph_engine.builtin_tools import (
            BUILTIN_TOOL_NAMES,
            get_builtin_tool_definitions,
        )

        lc_tools.extend(get_builtin_tool_definitions())

        _lc_tools = lc_tools
        _mcp_executor = tool_executor
        _mcp_tools_by_server = mcp_tools_by_server

        async def agent_node(state: GraphState, config: RunnableConfig) -> dict:
            effective_model = state.get("input_data", {}).get("_model_override") or model_id
            logger.info("Executing agent: %s with model: %s", agent.name, effective_model)
            messages = state.get("messages", [])
            llm_messages = [SystemMessage(content=system_prompt)]
            _inject_context_layers(llm_messages, state)
            llm_messages.extend(messages)

            execution_id = (config or {}).get("configurable", {}).get("thread_id")

            async def _is_cancelled() -> bool:
                if not execution_id:
                    return False
                from src.executions.cancel import check_revoke_intent

                return await check_revoke_intent(execution_id) == "cancel"

            user_id = (state.get("metadata") or {}).get("user_id")
            active_tools = list(_lc_tools)
            unified_executor = _mcp_executor

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
                    from src.internal.auth import get_internal_bearer_token

                    gateway_executor = GatewayToolExecutor(
                        gateway_url=_settings.GATEWAY_URL,
                        agent_id=agent.id,
                        execution_id=execution_id or "",
                        user_id=user_id or "",
                        internal_token=get_internal_bearer_token(),
                    )

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
                        agent.name,
                        len(extended_defs),
                        sum(1 for v in tool_categories.values() if v),
                    )

                if tool_categories.get("custom_tools"):
                    from src.infra.database import async_session_maker as _asm

                    registered_defs = await resolve_registered_custom_tools(agent.id, _asm)
                    if registered_defs:
                        active_tools.extend(registered_defs)
                        logger.info(
                            "Agent '%s': %d registered custom tools loaded",
                            agent.name,
                            len(registered_defs),
                        )

            if user_id:
                from src.graph_engine.builtin_tools import (
                    UnifiedToolExecutor,
                    create_builtin_executor,
                )
                from src.infra.database import async_session_maker

                if tool_categories and any(tool_categories.values()):
                    from src.tools.executor import ExtendedToolExecutor, ToolExecutorDeps

                    executor_deps = ToolExecutorDeps(
                        gateway_executor=gateway_executor,
                        publish_fn=_extract_tool_publish_fn(config),
                        execution_id=execution_id,
                    )
                    extended_executor = ExtendedToolExecutor(
                        session_maker=async_session_maker,
                        user_id=user_id,
                        agent_id=agent.id,
                        deps=executor_deps,
                    )

                scoped_mcp = _mcp_executor
                project_id = (state.get("metadata") or {}).get("project_id")
                if project_id and _mcp_executor and self.mcp_registry:
                    scoped_mcp = await _maybe_scope_mcp(
                        _mcp_executor, self.mcp_registry, project_id, async_session_maker
                    )

                builtin_exec = create_builtin_executor(user_id, async_session_maker)
                unified_executor = UnifiedToolExecutor(
                    builtin_exec,
                    scoped_mcp,
                    BUILTIN_TOOL_NAMES,
                    gateway_executor=gateway_executor,
                    extended_executor=extended_executor,
                )

                if agent.tool_mode == "auto":
                    from src.tools.discovery import (
                        ToolDiscoveryExecutor,
                        get_discovery_tool_definitions,
                    )

                    _allowed = [
                        k for k, v in (agent.tool_categories or {}).items()
                        if v is not False and not k.startswith("mcp:")
                    ]
                    unified_executor = ToolDiscoveryExecutor(
                        extended_executor=extended_executor,
                        mcp_executor=scoped_mcp,
                        gateway_executor=gateway_executor,
                        builtin_fn=builtin_exec,
                        builtin_names=BUILTIN_TOOL_NAMES,
                        mcp_tool_defs_by_server=_mcp_tools_by_server,
                        gateway_tool_defs=[],
                        allowed_categories=_allowed or None,
                    )
                    active_tools = get_discovery_tool_definitions()
                    logger.info(
                        "Agent '%s': auto tool mode — 2 discovery tools bound",
                        agent.name,
                    )
            else:
                active_tools = [
                    t
                    for t in active_tools
                    if t.get("function", {}).get("name") not in BUILTIN_TOOL_NAMES
                ]
                logger.debug("No user_id in state.metadata — built-in tools disabled")
                if gateway_executor:
                    from src.graph_engine.builtin_tools import UnifiedToolExecutor

                    unified_executor = UnifiedToolExecutor(
                        lambda *a: (_ for _ in ()).throw(ValueError("No builtin tools")),
                        _mcp_executor,
                        set(),
                        gateway_executor=gateway_executor,
                    )

            try:
                raw_kwargs = effective_llm_kwargs if agent.id == "__raw__" else {}
                llm = await self.llm_provider.get_model(effective_model, **raw_kwargs)

                if agent.id == "__raw__":
                    active_tools = []

                if active_tools and unified_executor:
                    from src.infra.config import get_settings

                    from .tool_loop import ToolLoopConfig, run_tool_loop, try_bind_tools

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

                logger.info("Agent response: %.100s...", response_text)
            except Exception as e:
                from src.executions.cancel import ExecutionCancelled

                if isinstance(e, ExecutionCancelled):
                    raise
                logger.error("Agent LLM error: %s", e)
                response_text = f"[Error] Failed to get response from {effective_model}: {str(e)}"

            return {
                "messages": [AIMessage(content=response_text)],
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

    _NODE_CREATORS: dict[str, str] = {
        "agent": "agent",
        "tool": "tool",
        "subgraph": "subgraph",
        "condition": "condition",
        "parallel": "parallel",
        "merge": "merge",
        "loop": "loop",
        "supervisor": "supervisor",
        "approval": "approval",
    }

    async def _create_node_function(
        self,
        node_id: str,
        node_type: str,
        node_data: dict[str, Any],
    ) -> NodeFn:
        """Create a node function based on node type by delegating to node modules."""
        if node_type not in self._NODE_CREATORS:
            return self._create_passthrough_node(node_id)

        if node_type == "agent":
            return await create_agent_node(
                node_id, node_data, self.config_provider, self.llm_provider, self.mcp_registry
            )
        elif node_type == "tool":
            return await create_tool_node(node_id, node_data, self.mcp_registry)
        elif node_type == "subgraph":
            return await create_subgraph_node(node_id, node_data)
        elif node_type == "condition":
            return create_condition_node(node_id, node_data)
        elif node_type == "parallel":
            return create_parallel_node(
                node_id, node_data, [], self._compiled_node_funcs
            )
        elif node_type == "merge":
            return create_merge_node(node_id, node_data)
        elif node_type == "loop":
            return create_loop_node(node_id, node_data, self._compiled_node_funcs)
        elif node_type == "supervisor":
            return await create_supervisor_node(
                node_id, node_data, self.config_provider, self.llm_provider
            )
        elif node_type == "approval":
            return create_approval_node(node_id, node_data)

        return self._create_passthrough_node(node_id)

    def _create_passthrough_node(self, node_id: str) -> NodeFn:
        """Create a passthrough node."""

        async def passthrough_node(state: GraphState) -> dict:
            return {"current_node": node_id}

        return passthrough_node

    def _get_interrupt_nodes(self, graph: GraphConfig) -> list[str]:
        """Get list of nodes that should interrupt for human input."""
        interrupt_nodes = []
        for node in graph.nodes:
            config = node.data.get("config", {})
            if config.get("requiresApproval"):
                interrupt_nodes.append(node.id)
        return interrupt_nodes
