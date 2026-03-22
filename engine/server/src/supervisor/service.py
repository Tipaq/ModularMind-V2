"""
Super Supervisor Service — Core orchestration engine.

Receives all user messages in supervisor mode and decides the routing
strategy: direct response, agent delegation, graph execution, ephemeral
agent creation, or multi-action.

The supervisor runs inline in the FastAPI request handler (not worker).
The actual heavy work (agent/graph execution) is delegated to the
Redis Streams worker via the router after this service returns.
"""

import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis
from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.provider import ConfigProvider
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH
from src.llm.base import LLMProvider

# Supervisor LLM configuration
ROUTING_TEMPERATURE = 0.1
TOOL_TEMPERATURE = 0.3
TOOL_LOOP_MAX_ITERATIONS = 10
EVENT_BUFFER_TTL_SECONDS = 300
MAX_TOOLS_IN_EVENT = 20

from .context_manager import get_context_manager
from .ephemeral_factory import EphemeralAgentFactory
from .message_parser import MessageParser
from .prompts import build_routing_task_prompt
from .schemas import RoutingDecision, RoutingStrategy

logger = logging.getLogger(__name__)


class SuperSupervisorService:
    """Main orchestration service for unified chat routing.

    Coordinates message parsing, LLM routing, context management,
    and execution dispatch. Does NOT dispatch to the worker — the router
    handles that (single dispatch point).
    """

    def __init__(
        self,
        db: AsyncSession,
        config_provider: ConfigProvider,
        llm_provider: LLMProvider,
        redis_client: aioredis.Redis,
    ):
        self.db = db
        self.config_provider = config_provider
        self.llm_provider = llm_provider
        self.redis = redis_client
        self.parser = MessageParser(config_provider)
        self.context_manager = get_context_manager()  # singleton
        self.ephemeral_factory = EphemeralAgentFactory(
            config_provider,
            redis_client,
        )
        self.exec_service = ExecutionService(db)

    def _resolve_model_name(self, conv_config: dict[str, Any]) -> tuple[str, str]:
        """Resolve supervisor model ID and extract model name.

        Returns (model_id, model_name) from conversation config.
        The router validates that model_id is set before reaching here.
        """
        from src.infra.constants import parse_model_id

        model_id = conv_config["model_id"]
        _, model_name = parse_model_id(model_id)
        return model_id, model_name

    async def _publish_event(self, channel: str, event: dict[str, Any]) -> None:
        """Async Redis PUBLISH for event streaming."""
        try:
            await self.redis.publish(channel, json.dumps(event))
        except (aioredis.RedisError, ConnectionError) as e:
            logger.warning("Failed to publish event to %s: %s", channel, e)

    # =========================================================================
    # Main entry point
    # =========================================================================

    async def process_message(
        self,
        conversation_id: str,
        content: str,
        user_id: str,
        messages: list[dict[str, Any]] | None = None,
        conv_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Process a user message through the supervisor pipeline.

        Args:
            conversation_id: The conversation to process in
            content: Raw user message
            user_id: The user ID
            messages: Recent conversation messages (for context building)
            conv_config: Per-conversation config (enabled_agents, enabled_graphs, etc.)

        Returns:
            dict with execution_id(s), routing_metadata, and optionally
            direct_response. The router uses this to dispatch worker tasks
            and build the HTTP response.
        """
        conv_config = conv_config or {}
        conv_config = self._auto_enable_mcp_servers(conv_config)

        routing_start = time.perf_counter()
        decision = await self._resolve_routing(
            conversation_id,
            content,
            messages,
            conv_config,
            user_id=user_id,
        )
        routing_duration_ms = int((time.perf_counter() - routing_start) * 1000)

        routing_metadata = self._build_routing_metadata(decision)
        routing_metadata["duration_ms"] = routing_duration_ms
        logger.info(
            "Routing decision: strategy=%s confidence=%.2f reasoning='%s'",
            decision.strategy.value,
            decision.confidence or 0,
            decision.reasoning or "",
        )

        # Parse for effective content (strip @mentions, /commands)
        parsed, _ = await self.parser.parse_multi(content)
        effective_content = parsed.clean_content or parsed.create_instructions or content

        result = await self._execute_strategy(
            decision,
            conversation_id,
            effective_content,
            user_id,
            conv_config,
        )
        result["routing_metadata"] = routing_metadata
        result["user_profile"] = getattr(self, "_last_user_profile", None)
        result["knowledge_data"] = getattr(self, "_last_knowledge_data", None)
        from src.infra.config import get_settings as _get_settings

        _settings = _get_settings()
        _model_id = (conv_config or {}).get("model_id", "")
        try:
            from src.prompt_layers.context import AgentContextBuilder

            _cw = (
                AgentContextBuilder.resolve_context_window(_model_id)
                if _model_id
                else (_settings.CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW)
            )
        except (KeyError, ValueError, AttributeError):
            _cw = _settings.CONTEXT_BUDGET_DEFAULT_CONTEXT_WINDOW
        _max_pct = getattr(_settings, "CONTEXT_BUDGET_MAX_PCT", 100.0)
        _effective_cw = int(_cw * _max_pct / 100)
        _hist_budget = int(_effective_cw * _settings.CONTEXT_BUDGET_HISTORY_PCT / 100)
        _total_chars = sum(len(m.get("content") or "") for m in (messages or []))
        _max_chars = _hist_budget * 4
        _mem_budget = int(_effective_cw * _settings.CONTEXT_BUDGET_PROFILE_PCT / 100)
        _rag_budget = int(_effective_cw * _settings.CONTEXT_BUDGET_RAG_PCT / 100)
        _sys_budget = int(_effective_cw * _settings.CONTEXT_BUDGET_SYSTEM_PCT / 100)
        # Count supervisor prompt layer token usage
        from src.prompt_layers.loader import (
            get_supervisor_identity,
            get_supervisor_personality,
            get_tool_task,
        )

        _sys_chars = (
            len(get_supervisor_identity())
            + len((conv_config or {}).get("supervisor_prompt") or get_supervisor_personality())
            + len(get_tool_task())
        )
        _sys_used = _sys_chars // 4
        _history_used = _total_chars // 4
        _profile_text = getattr(self, "_last_user_profile", None) or ""
        _mem_used = len(_profile_text) // 4
        _knowledge = getattr(self, "_last_knowledge_data", None)
        _rag_used = 0
        if _knowledge and isinstance(_knowledge, list) and len(_knowledge) > 0:
            chunks = _knowledge[0].get("chunks", [])
            _rag_used = sum(len(c.get("content_preview", "")) for c in chunks) // 4
        result["context_data"] = {
            "history": {
                "budget": {
                    "included_count": len(messages or []),
                    "total_chars": _total_chars,
                    "max_chars": _max_chars,
                    "budget_exceeded": _total_chars > _max_chars,
                    "context_window": _cw,
                    "history_budget_pct": _settings.CONTEXT_BUDGET_HISTORY_PCT,
                    "history_budget_tokens": _hist_budget,
                },
                "messages": [
                    {
                        "role": m.get("role", "unknown"),
                        "content": (m.get("content") or "")[:200],
                    }
                    for m in (messages or [])[-10:]
                ],
                "summary": "",
            },
            "user_profile": _profile_text or None,
            "budget_overview": {
                "context_window": _cw,
                "effective_context": _effective_cw,
                "max_pct": _max_pct,
                "layers": {
                    "history": {
                        "pct": _settings.CONTEXT_BUDGET_HISTORY_PCT,
                        "allocated": _hist_budget,
                        "used": _history_used,
                    },
                    "memory": {
                        "pct": _settings.CONTEXT_BUDGET_PROFILE_PCT,
                        "allocated": _mem_budget,
                        "used": _mem_used,
                    },
                    "rag": {
                        "pct": _settings.CONTEXT_BUDGET_RAG_PCT,
                        "allocated": _rag_budget,
                        "used": _rag_used,
                    },
                    "system": {
                        "pct": _settings.CONTEXT_BUDGET_SYSTEM_PCT,
                        "allocated": _sys_budget,
                        "used": _sys_used,
                    },
                },
            },
        }
        return result

    # =========================================================================
    # Routing resolution
    # =========================================================================

    def _auto_enable_mcp_servers(self, conv_config: dict[str, Any]) -> dict[str, Any]:
        """Auto-enable all registered MCP servers when none are explicitly set."""
        if conv_config.get("enabled_mcp_servers"):
            return conv_config
        try:
            from src.infra.config import get_settings

            if get_settings().MCP_AUTO_ENABLE:
                from src.mcp.service import get_mcp_registry

                all_servers = get_mcp_registry().list_servers()
                auto_ids = [s.id for s in all_servers if s.enabled]
                if auto_ids:
                    conv_config = {**conv_config, "enabled_mcp_servers": auto_ids}
                    logger.debug("MCP auto-enable: %d server(s) for conversation", len(auto_ids))
        except Exception as e:  # MCP registry may raise heterogeneous errors
            logger.debug("MCP auto-enable check failed: %s", e)
        return conv_config

    async def _resolve_routing(
        self,
        conversation_id: str,
        content: str,
        messages: list[dict[str, Any]] | None,
        conv_config: dict[str, Any],
        user_id: str = "",
    ) -> RoutingDecision:
        """Determine routing strategy from message content and context."""
        parsed, matched_agent_ids = await self.parser.parse_multi(content)

        if parsed.create_directive:
            return RoutingDecision(
                strategy=RoutingStrategy.CREATE_AGENT,
                reasoning="User used @create directive",
                confidence=1.0,
                ephemeral_config={
                    "name": "Ephemeral Agent",
                    "description": parsed.create_instructions or "",
                    "system_prompt": (
                        f"You are a specialized assistant. "
                        f"User requested: {parsed.create_instructions}"
                    ),
                },
            )

        if parsed.explicit_graph:
            return RoutingDecision(
                strategy=RoutingStrategy.EXECUTE_GRAPH,
                graph_id=parsed.explicit_graph,
                reasoning="User used /graph: command",
                confidence=1.0,
            )

        if len(matched_agent_ids) > 1:
            sub_decisions = [
                RoutingDecision(
                    strategy=RoutingStrategy.DELEGATE_AGENT,
                    agent_id=aid,
                    reasoning=f"Explicit @mention (multi-action #{i + 1})",
                    confidence=1.0,
                )
                for i, aid in enumerate(matched_agent_ids)
            ]
            return RoutingDecision(
                strategy=RoutingStrategy.MULTI_ACTION,
                reasoning=f"Multiple @mentions detected ({len(matched_agent_ids)} agents)",
                confidence=1.0,
                sub_decisions=sub_decisions,
            )

        if parsed.explicit_agent:
            return RoutingDecision(
                strategy=RoutingStrategy.DELEGATE_AGENT,
                agent_id=parsed.explicit_agent,
                reasoning="User used @AgentName mention",
                confidence=1.0,
            )

        # No explicit routing — use LLM with session affinity
        last_agent = await self.context_manager.get_last_agent(conversation_id)

        # Retrieve user profile for routing context
        memory_context = ""
        self._last_user_profile: str | None = None
        if user_id:
            memory_context = await self._get_memory_context(user_id)
            self._last_user_profile = memory_context or None

        # Retrieve knowledge context from agents' RAG collections
        knowledge_context = ""
        self._last_knowledge_data: dict[str, Any] | None = None
        knowledge_context, self._last_knowledge_data = await self._get_knowledge_context(
            content,
            conv_config,
        )

        decision = await self._route_with_llm(
            conversation_id,
            parsed.clean_content,
            messages=messages,
            affinity_agent_id=last_agent,
            conv_config=conv_config,
            memory_context=memory_context,
            knowledge_context=knowledge_context,
        )
        decision = self._apply_single_selection_override(decision, conv_config)
        return decision

    def _apply_single_selection_override(
        self,
        decision: RoutingDecision,
        conv_config: dict[str, Any],
    ) -> RoutingDecision:
        """Override LLM routing when user pinned a single agent/graph."""
        enabled_agents = conv_config.get("enabled_agents") or []
        enabled_graphs = conv_config.get("enabled_graphs") or []

        if decision.strategy == RoutingStrategy.DELEGATE_AGENT:
            if len(enabled_agents) == 1:
                decision.agent_id = enabled_agents[0]
        elif decision.strategy == RoutingStrategy.EXECUTE_GRAPH and len(enabled_graphs) == 1:
            decision.graph_id = enabled_graphs[0]

        return decision

    def _build_routing_metadata(self, decision: RoutingDecision) -> dict[str, Any]:
        """Build metadata dict for trace events."""
        return {
            "type": "trace:routing_decision",
            "strategy": decision.strategy.value,
            "reasoning": decision.reasoning,
            "agent_id": decision.agent_id,
            "graph_id": decision.graph_id,
            "confidence": decision.confidence,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    # =========================================================================
    # LLM routing
    # =========================================================================

    async def _route_with_llm(
        self,
        conversation_id: str,
        content: str,
        messages: list[dict[str, Any]] | None = None,
        affinity_agent_id: str | None = None,
        conv_config: dict[str, Any] | None = None,
        memory_context: str = "",
        knowledge_context: str = "",
    ) -> RoutingDecision:
        """Call supervisor LLM for routing decision."""
        conv_config = conv_config or {}
        try:
            task_prompt = await self._build_routing_prompt(
                messages,
                affinity_agent_id,
                conv_config,
                memory_context=memory_context,
                knowledge_context=knowledge_context,
            )
            llm_messages = self._compose_routing_messages(conv_config, task_prompt)

            _, model_name = self._resolve_model_name(conv_config)
            llm = await self.llm_provider.get_model(
                model_name,
                temperature=ROUTING_TEMPERATURE,
                format="json",
            )
            response = await llm.ainvoke(llm_messages + [HumanMessage(content=content)])

            return self._parse_routing_response(response)

        except Exception as e:  # LLM providers raise heterogeneous errors
            logger.error("LLM routing failed: %s", e, exc_info=True)
            return RoutingDecision(
                strategy=RoutingStrategy.DIRECT_RESPONSE,
                reasoning=f"Routing failed: {e}",
                confidence=0.0,
            )

    async def _build_routing_prompt(
        self,
        messages: list[dict[str, Any]] | None,
        affinity_agent_id: str | None,
        conv_config: dict[str, Any],
        memory_context: str = "",
        knowledge_context: str = "",
    ) -> str:
        """Build the routing task prompt with agent/graph catalog and MCP tools."""
        agents = await self.config_provider.list_agents()
        graphs = await self.config_provider.list_graphs()

        if enabled_agents := conv_config.get("enabled_agents"):
            agents = [a for a in agents if a.id in enabled_agents]
        if enabled_graphs := conv_config.get("enabled_graphs"):
            graphs = [g for g in graphs if g.id in enabled_graphs]

        last_agent_info = None
        if affinity_agent_id:
            agent = await self.config_provider.get_agent_config(affinity_agent_id)
            if agent:
                last_agent_info = f"{agent.name} (id={agent.id})"

        mcp_tools = await self._discover_mcp_tools_for_routing(conv_config)

        allowed_tool_categories = conv_config.get("supervisor_tool_categories")

        return build_routing_task_prompt(
            agents=agents,
            graphs=graphs,
            history=messages or [],
            last_agent=last_agent_info,
            mcp_tools=mcp_tools,
            memory_context=memory_context,
            knowledge_context=knowledge_context,
            allowed_tool_categories=allowed_tool_categories,
        )

    async def _discover_mcp_tools_for_routing(
        self,
        conv_config: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Discover MCP tools to include in routing context."""
        enabled_servers = conv_config.get("enabled_mcp_servers", [])
        if not enabled_servers:
            return None
        try:
            from src.mcp.service import get_mcp_registry

            registry = get_mcp_registry()
            tools_map: dict[str, Any] = {}
            for sid in enabled_servers:
                server = registry.get_server(sid)
                server_name = server.name if server else sid[:8]
                try:
                    tools = await registry.discover_tools(sid)
                    if tools:
                        tools_map[server_name] = tools
                except Exception:  # MCP protocol errors are heterogeneous
                    logger.debug(
                        "MCP tool discovery failed for server %s",
                        sid,
                        exc_info=True,
                    )
            return tools_map or None
        except Exception as e:  # MCP registry/protocol errors are heterogeneous
            logger.debug("MCP tool discovery for routing failed: %s", e)
            return None

    def _compose_routing_messages(
        self,
        conv_config: dict[str, Any],
        task_prompt: str,
    ) -> list[Any]:
        """Compose layered LLM messages for routing (identity + task)."""
        from src.prompt_layers import (
            LayerType,
            PromptComposer,
            PromptLayer,
            get_supervisor_identity,
        )

        composer = PromptComposer()
        composer.add(
            PromptLayer(LayerType.IDENTITY, get_supervisor_identity(), "supervisor_identity")
        )
        composer.add(PromptLayer(LayerType.TASK, task_prompt, "routing_task"))
        return composer.build()

    def _parse_routing_response(self, response) -> RoutingDecision:
        """Parse LLM response into a RoutingDecision."""
        response_text = (
            response.content if isinstance(response.content, str) else str(response.content)
        )
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "\n".join(lines)
        return RoutingDecision.model_validate_json(cleaned)

    # =========================================================================
    # Strategy execution
    # =========================================================================

    async def _execute_strategy(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute the chosen routing strategy."""
        # Use extracted prompt for delegation strategies (refined by routing LLM)
        agent_prompt = decision.extracted_prompt or content

        match decision.strategy:
            case RoutingStrategy.DIRECT_RESPONSE:
                return await self._handle_direct_response(
                    decision, conv_id, content, user_id, conv_config,
                )
            case RoutingStrategy.TOOL_RESPONSE:
                return await self._handle_tool_response(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                )
            case RoutingStrategy.DELEGATE_AGENT:
                return await self._handle_agent_delegation(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                    conv_config,
                )
            case RoutingStrategy.EXECUTE_GRAPH:
                return await self._handle_graph_execution(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                )
            case RoutingStrategy.CREATE_AGENT:
                return await self._handle_create_agent(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                    conv_config,
                )
            case RoutingStrategy.MULTI_ACTION:
                return await self._handle_multi_action(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                )
            case _:
                return {
                    "direct_response": "Unknown routing strategy",
                    "execution_id": None,
                }

    async def _handle_direct_response(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle DIRECT_RESPONSE — create a raw execution for SSE streaming."""
        from src.prompt_layers import get_supervisor_identity

        model_id = conv_config.get("model_id", "ollama:qwen3:8b")

        execution_data = ExecutionCreate(
            prompt=content,
            session_id=conv_id,
            input_data={
                "routing_strategy": "DIRECT_RESPONSE",
                "_supervisor_direct": True,
                "_raw_system_prompt": get_supervisor_identity(),
            },
        )
        execution = await self.exec_service.start_raw_execution(
            model_id=model_id,
            data=execution_data,
            user_id=user_id,
        )

        return {
            "execution_id": execution.id,
        }

    # =========================================================================
    # TOOL_RESPONSE handler
    # =========================================================================

    async def _handle_tool_response(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle TOOL_RESPONSE — supervisor answers using discovered tools.

        Uses two meta-tools (search_tools + use_tool) to give the supervisor
        access to all tool sources without binding dozens of tools directly.
        """
        from src.graph_engine.tool_loop import run_tool_loop, try_bind_tools

        execution, publish_fn = await self._setup_tool_execution(
            conv_id, content, user_id,
        )

        discovery_defs, discovery_executor = await self._create_discovery_tools(
            user_id, conv_config, publish_fn, execution.id,
        )

        _, model_name = self._resolve_model_name(conv_config)

        try:
            llm = await self.llm_provider.get_model(model_name, temperature=TOOL_TEMPERATURE)
            llm_with_tools, tools_bound = try_bind_tools(llm, discovery_defs)

            if not tools_bound:
                logger.info("Model %s doesn't support tools, falling back", model_name)
                return await self._handle_direct_response(
                    decision, conv_id, content, user_id, conv_config,
                )

            memory_context = await self._get_memory_context(user_id)
            llm_messages = self._compose_tool_messages(
                conv_config,
                content,
                memory_context=memory_context,
            )

            step_start = time.perf_counter()

            await self._publish_tool_step_started(
                publish_fn,
                execution.id,
                model_name,
                discovery_defs,
            )

            from src.infra.config import get_settings

            response_text, _ = await run_tool_loop(
                llm_with_tools,
                llm_messages,
                discovery_executor,
                max_iterations=TOOL_LOOP_MAX_ITERATIONS,
                tool_call_timeout=get_settings().MCP_TOOL_CALL_TIMEOUT,
                publish_fn=publish_fn,
            )

            step_duration_ms = int((time.perf_counter() - step_start) * 1000)

            await self._finalize_tool_response(
                conv_id,
                execution,
                response_text,
                publish_fn,
                step_duration_ms=step_duration_ms,
            )

            return {
                "execution_id": execution.id,
                "tool_response_inline": True,
            }

        except Exception as e:  # LLM providers raise heterogeneous errors
            logger.error("TOOL_RESPONSE execution failed: %s", e, exc_info=True)
            await publish_fn(
                {
                    "type": "error",
                    "event": "run_failed",
                    "execution_id": execution.id,
                    "message": str(e),
                }
            )
            return await self._handle_direct_response(
                decision, conv_id, content, user_id, conv_config,
            )

    async def _create_discovery_tools(
        self,
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
        from src.tools.executor import ExtendedToolExecutor

        allowed_categories = conv_config.get("supervisor_tool_categories")

        # MCP tools (per-request discovery)
        mcp_tools, mcp_executor = await self._discover_mcp_tools(conv_config)

        # Extended tools
        extended_executor = ExtendedToolExecutor(
            session_maker=async_session_maker,
            user_id=user_id,
            agent_id="supervisor",
            publish_fn=publish_fn,
        )

        # Gateway tools (only if gateway is configured)
        gateway_executor = None
        gateway_tool_defs: list[dict[str, Any]] = []
        settings = get_settings()
        if settings.GATEWAY_URL:
            from src.gateway.executor import GatewayToolExecutor
            from src.gateway.tool_definitions import get_gateway_tool_definitions
            from src.internal.auth import get_internal_bearer_token

            gateway_tool_defs = get_gateway_tool_definitions(
                {"shell": {"enabled": True}, "network": {"enabled": True}},
            )
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
            mcp_tool_defs=mcp_tools or [],
            gateway_tool_defs=gateway_tool_defs,
            allowed_categories=allowed_categories,
        )

        return get_discovery_tool_definitions(), discovery_executor

    async def _discover_mcp_tools(self, conv_config: dict[str, Any]) -> tuple[list | None, Any]:
        """Discover and convert MCP tools for tool-calling execution."""
        from src.mcp.service import get_mcp_registry
        from src.mcp.tool_adapter import discover_and_convert

        enabled_servers = conv_config.get("enabled_mcp_servers", [])
        if not enabled_servers:
            logger.debug("No enabled MCP servers for supervisor tools")
            return None, None

        registry = get_mcp_registry()
        lc_tools, tool_executor = await discover_and_convert(
            registry,
            enabled_servers,
        )

        if not lc_tools or not tool_executor:
            logger.debug("No MCP tools discovered for supervisor")
            return None, None

        return lc_tools, tool_executor

    async def _setup_tool_execution(
        self,
        conv_id: str,
        content: str,
        user_id: str,
    ) -> tuple[Any, Any]:
        """Create execution record and build a publish_fn for streaming."""
        execution = await self.exec_service.start_supervisor_execution(
            conversation_id=conv_id,
            input_prompt=content,
            user_id=user_id,
        )
        await self.db.commit()

        exec_channel = f"execution:{execution.id}"
        seq = 0

        async def publish_fn(event: dict[str, Any]) -> None:
            nonlocal seq
            seq += 1
            event["seq"] = seq
            event["execution_id"] = execution.id
            event_json = json.dumps(event, default=str)
            await self.redis.publish(exec_channel, event_json)
            await self.redis.rpush(f"buffer:{execution.id}", event_json)
            await self.redis.expire(f"buffer:{execution.id}", EVENT_BUFFER_TTL_SECONDS)

        return execution, publish_fn

    async def _get_memory_context(self, user_id: str) -> str:
        """Retrieve user profile context for supervisor inline responses."""
        try:
            from src.auth.models import User
            from src.infra.database import async_session_maker

            async with async_session_maker() as session:
                user = await session.get(User, user_id)
                profile = user.preferences if user else None

            if profile:
                return f"User profile:\n{profile}"
            return ""

        except Exception as e:
            logger.warning("User profile retrieval for supervisor failed: %s", e, exc_info=True)
            return ""

    async def _get_knowledge_context(
        self,
        query: str,
        conv_config: dict[str, Any],
    ) -> tuple[str, dict[str, Any] | None]:
        """Retrieve knowledge (RAG) context from agents' collections.

        Collects all RAG collection IDs from enabled agents and performs
        a unified retrieval.  The formatted text is injected into the
        supervisor's routing prompt so it can answer directly when
        the knowledge is sufficient.

        Returns:
            Tuple of (formatted_text, knowledge_data_dict_or_None).
        """
        try:
            from sqlalchemy import select as sa_select

            from src.embedding.resolver import get_knowledge_embedding_provider
            from src.infra.database import async_session_maker
            from src.rag.models import RAGCollection
            from src.rag.repository import RAGRepository
            from src.rag.retriever import RAGRetriever

            # Collect collection IDs from enabled agents that have RAG
            agents = await self.config_provider.list_agents()
            enabled = conv_config.get("enabled_agents")
            if enabled:
                agents = [a for a in agents if a.id in enabled]

            all_collection_ids = []
            for agent in agents:
                if (
                    agent.rag_config
                    and agent.rag_config.enabled
                    and agent.rag_config.collection_ids
                ):
                    all_collection_ids.extend(agent.rag_config.collection_ids)

            if not all_collection_ids:
                return "", None

            # Deduplicate
            all_collection_ids = list(dict.fromkeys(all_collection_ids))

            embedding_provider = get_knowledge_embedding_provider()
            if embedding_provider is None:
                return "", None

            async with async_session_maker() as session:
                repo = RAGRepository(session)
                retriever = RAGRetriever(repo, embedding_provider, default_limit=5)
                raw_results = await retriever.retrieve_raw(
                    query=query,
                    user_id="",
                    collection_ids=all_collection_ids,
                    limit=5,
                    threshold=0.3,
                )

                if not raw_results:
                    return "", None

                # Hydrate collection names
                coll_ids = {r.collection_id for r in raw_results}
                rows = await session.execute(
                    sa_select(RAGCollection.id, RAGCollection.name).where(
                        RAGCollection.id.in_(coll_ids)
                    )
                )
                coll_map = {row[0]: row[1] for row in rows.all()}

                # Build serialisable results for frontend
                collections_seen: dict[str, dict[str, Any]] = {}
                chunks: list[dict[str, Any]] = []
                for r in raw_results:
                    cid = r.collection_id
                    cname = coll_map.get(cid, "Unknown")
                    if cid not in collections_seen:
                        collections_seen[cid] = {
                            "collection_id": cid,
                            "collection_name": cname,
                            "chunk_count": 0,
                        }
                    collections_seen[cid]["chunk_count"] += 1
                    chunks.append(
                        {
                            "chunk_id": r.chunk_id,
                            "document_id": r.document_id,
                            "collection_id": cid,
                            "collection_name": cname,
                            "document_filename": r.document.filename if r.document else None,
                            "content_preview": (r.content or "")[:300],
                            "score": round(r.score, 4),
                            "chunk_index": r.chunk_index,
                        }
                    )

                knowledge_data = {
                    "collections": list(collections_seen.values()),
                    "chunks": chunks,
                    "total_results": len(raw_results),
                }

                formatted = retriever.format_context(raw_results)
                logger.info(
                    "Knowledge context: %d results from %d collections",
                    len(raw_results),
                    len(collections_seen),
                )
                return formatted, knowledge_data

        except Exception as e:  # Resilience: mixed DB + RAG + embedding ops
            logger.warning("Knowledge retrieval for supervisor failed: %s", e, exc_info=True)
            return "", None

    def _compose_tool_messages(
        self,
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

    async def _publish_tool_step_started(
        self,
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

    async def _finalize_tool_response(
        self,
        conv_id: str,
        execution,
        response_text: str,
        publish_fn,
        *,
        step_duration_ms: int | None = None,
    ) -> None:
        """Save response, update execution status, and publish completion events."""
        from src.conversations.models import MessageRole
        from src.conversations.service import ConversationService
        from src.executions.models import ExecutionStatus

        conv_service = ConversationService(self.db)
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
        await self.db.commit()

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

    # =========================================================================
    # Agent delegation
    # =========================================================================

    async def _handle_agent_delegation(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle DELEGATE_AGENT — create execution record for an agent."""
        agent_id = decision.agent_id
        if not agent_id:
            return {
                "direct_response": "No agent specified for delegation",
                "execution_id": None,
            }

        agent = await self.config_provider.get_agent_config(agent_id)
        if not agent:
            return {
                "direct_response": f"Agent {agent_id} not found",
                "execution_id": None,
            }

        # Rebuild sub-context if Redis cache miss
        sub_ctx = await self.context_manager.get_sub_context(conv_id, agent_id)
        if not sub_ctx:
            from src.conversations.service import ConversationService

            conv_service = ConversationService(self.db)
            conv = await conv_service.get_conversation(conv_id)
            if conv and conv.messages:
                msg_dicts = [
                    {"role": m.role.value, "content": m.content, "meta": m.meta}
                    for m in conv.messages
                ]
                await self.context_manager.rebuild_from_messages(
                    conv_id,
                    msg_dicts,
                )

        mcp_server_ids = conv_config.get("enabled_mcp_servers", [])
        input_data: dict[str, Any] = {
            "routing_strategy": decision.strategy.value,
            "delegated_to": agent.name,
        }
        if mcp_server_ids:
            input_data["mcp_server_ids"] = mcp_server_ids
        execution_data = ExecutionCreate(
            prompt=content,
            session_id=conv_id,
            input_data=input_data,
        )
        execution = await self.exec_service.start_agent_execution(
            agent_id=agent_id,
            data=execution_data,
            user_id=user_id,
        )

        await self.context_manager.set_last_agent(conv_id, agent_id)

        return {"execution_id": execution.id}

    async def _handle_graph_execution(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
    ) -> dict[str, Any]:
        """Handle EXECUTE_GRAPH — create execution record for a graph."""
        graph_id = decision.graph_id
        if not graph_id:
            # LLM may have put the id in agent_id instead — fall back to delegation
            if decision.agent_id:
                logger.info(
                    "EXECUTE_GRAPH has no graph_id but agent_id=%s — falling back to DELEGATE_AGENT",  # noqa: E501
                    decision.agent_id,
                )
                decision.strategy = RoutingStrategy.DELEGATE_AGENT
                return await self._handle_agent_delegation(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    {},
                )
            return {
                "direct_response": "No graph specified for execution",
                "execution_id": None,
            }

        graph_config = await self.config_provider.get_graph_config(graph_id)
        # If the graph doesn't exist, the LLM may have confused an agent for a graph.
        # Try graph_id as an agent_id, or fall back to decision.agent_id.
        if not graph_config:
            fallback_agent_id = decision.agent_id
            # Check if graph_id is actually an agent
            if not fallback_agent_id:
                agent_check = await self.config_provider.get_agent_config(graph_id)
                if agent_check:
                    fallback_agent_id = graph_id
            if fallback_agent_id:
                logger.info(
                    "Graph %s not found, falling back to DELEGATE_AGENT with agent_id=%s",
                    graph_id,
                    fallback_agent_id,
                )
                decision.agent_id = fallback_agent_id
                decision.strategy = RoutingStrategy.DELEGATE_AGENT
                return await self._handle_agent_delegation(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    {},
                )
        graph_name = graph_config.name if graph_config else graph_id

        execution_data = ExecutionCreate(
            prompt=content,
            session_id=conv_id,
            input_data={
                "routing_strategy": decision.strategy.value,
                "delegated_to": graph_name,
            },
        )
        execution = await self.exec_service.start_graph_execution(
            graph_id=graph_id,
            data=execution_data,
            user_id=user_id,
        )

        return {"execution_id": execution.id}

    async def _handle_create_agent(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle CREATE_AGENT — create ephemeral agent, then delegate."""
        try:
            ec = decision.ephemeral_config or {}
            conv_model_id = conv_config.get("model_id")
            agent = await self.ephemeral_factory.create_agent(
                name=ec.get("name", "Ephemeral Agent"),
                description=ec.get("description", ""),
                system_prompt=ec.get("system_prompt", "You are a helpful assistant."),
                conversation_id=conv_id,
                model_id=ec.get("model_id") or conv_model_id,
                capabilities=ec.get("capabilities"),
                rag_collections=ec.get("rag_collections"),
                mcp_server_ids=ec.get("mcp_server_ids"),
            )
        except ValueError as e:
            return {
                "direct_response": f"Cannot create agent: {e}",
                "execution_id": None,
                "error": str(e),
            }

        delegate_decision = RoutingDecision(
            strategy=RoutingStrategy.DELEGATE_AGENT,
            agent_id=str(agent.id),
            reasoning=f"Delegating to newly created ephemeral agent: {agent.name}",
            confidence=1.0,
        )
        result = await self._handle_agent_delegation(
            delegate_decision,
            conv_id,
            content,
            user_id,
            conv_config,
        )

        result["ephemeral_agent"] = {
            "id": str(agent.id),
            "name": agent.name,
            "description": agent.description,
        }
        return result

    async def _handle_multi_action(
        self,
        decision: RoutingDecision,
        conv_id: str,
        content: str,
        user_id: str,
        conv_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle MULTI_ACTION — execute multiple sub-decisions sequentially."""
        results = []
        execution_ids = []
        sub_decisions = decision.sub_decisions or []

        for i, sub in enumerate(sub_decisions):
            try:
                result = await self._execute_strategy(
                    sub,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                )
                results.append(result)
                if result.get("execution_id"):
                    execution_ids.append(result["execution_id"])
            except Exception as e:  # Resilience: sub-decisions must not abort the batch
                logger.error(
                    "MULTI_ACTION sub-decision %d/%d failed: %s",
                    i + 1,
                    len(sub_decisions),
                    e,
                )
                results.append({"error": str(e)})

        return {
            "results": results,
            "execution_ids": execution_ids,
        }
