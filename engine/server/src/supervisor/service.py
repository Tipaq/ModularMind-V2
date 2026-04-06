"""
Super Supervisor Service — Core orchestration engine.

Receives all user messages in supervisor mode and decides the routing
strategy: direct response, agent delegation, graph execution, ephemeral
agent creation, or multi-action.

The supervisor runs inline in the FastAPI request handler (not worker).
The actual heavy work (agent/graph execution) is delegated to the
Redis Streams worker via the router after this service returns.
"""

import logging
import time
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.provider import ConfigProvider
from src.executions.service import ExecutionService
from src.llm.base import LLMProvider

from .context_manager import get_context_manager
from .context_retriever import get_knowledge_context, get_memory_context
from .ephemeral_factory import EphemeralAgentFactory
from .llm_router import route_with_llm
from .message_parser import MessageParser
from .routing import build_routing_metadata, resolve_routing
from .schemas import RoutingDecision, RoutingStrategy
from .strategy_handlers import (
    handle_agent_delegation,
    handle_create_agent,
    handle_direct_response,
    handle_graph_execution,
    handle_multi_action,
)
from .tool_handler import handle_tool_response

EVENT_BUFFER_TTL_SECONDS = 300

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

        Uses SUPERVISOR_MODEL_ID setting if configured, otherwise falls back
        to the conversation's model_id.
        """
        from src.infra.config import get_settings
        from src.infra.constants import parse_model_id

        settings = get_settings()
        model_id = settings.SUPERVISOR_MODEL_ID or conv_config["model_id"]
        _, model_name = parse_model_id(model_id)
        return model_id, model_name

    async def _publish_event(self, channel: str, event: dict[str, Any]) -> None:
        """Async Redis PUBLISH for event streaming."""
        import json

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

        routing_start = time.perf_counter()
        decision = await resolve_routing(
            conversation_id=conversation_id,
            content=content,
            messages=messages,
            conv_config=conv_config,
            user_id=user_id,
            parser=self.parser,
            context_manager=self.context_manager,
            config_provider=self.config_provider,
            get_memory_context_fn=get_memory_context,
            get_knowledge_context_fn=lambda q, cc: get_knowledge_context(
                q, cc, self.config_provider
            ),
            route_with_llm_fn=lambda cid, c, **kw: route_with_llm(
                cid,
                c,
                config_provider=self.config_provider,
                llm_provider=self.llm_provider,
                resolve_model_name_fn=self._resolve_model_name,
                **kw,
            ),
            resolve_model_name_fn=self._resolve_model_name,
            state_holder=self,
        )
        routing_duration_ms = int((time.perf_counter() - routing_start) * 1000)

        routing_metadata = build_routing_metadata(decision)
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
                return await handle_direct_response(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                    self.exec_service,
                )
            case RoutingStrategy.TOOL_RESPONSE:
                return await handle_tool_response(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                    db=self.db,
                    config_provider=self.config_provider,
                    llm_provider=self.llm_provider,
                    redis_client=self.redis,
                    exec_service=self.exec_service,
                    resolve_model_name_fn=self._resolve_model_name,
                    handle_direct_response_fn=lambda d, ci, co, ui, cc: handle_direct_response(
                        d, ci, co, ui, cc, self.exec_service
                    ),
                )
            case RoutingStrategy.DELEGATE_AGENT:
                return await handle_agent_delegation(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                    conv_config,
                    self.db,
                    self.config_provider,
                    self.context_manager,
                    self.exec_service,
                )
            case RoutingStrategy.EXECUTE_GRAPH:
                return await handle_graph_execution(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                    self.db,
                    self.config_provider,
                    self.context_manager,
                    self.exec_service,
                )
            case RoutingStrategy.CREATE_AGENT:
                return await handle_create_agent(
                    decision,
                    conv_id,
                    agent_prompt,
                    user_id,
                    conv_config,
                    self.db,
                    self.config_provider,
                    self.context_manager,
                    self.exec_service,
                    self.ephemeral_factory,
                )
            case RoutingStrategy.MULTI_ACTION:
                return await handle_multi_action(
                    decision,
                    conv_id,
                    content,
                    user_id,
                    conv_config,
                    self._execute_strategy,
                )
            case _:
                return {
                    "direct_response": "Unknown routing strategy",
                    "execution_id": None,
                }
