"""
Agent executor.

Handles inline agent execution with LLM calls, context building,
and real-time event streaming.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import ConfigProvider
from src.graph_engine import GraphCompiler, create_initial_state
from src.infra.config import get_settings
from src.infra.constants import KNOWN_PROVIDERS as _KNOWN_PROVIDERS
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH, SSE_CONTENT_LENGTH
from src.infra.utils import utcnow
from src.llm import get_llm_provider
from src.mcp.service import get_mcp_registry

from .creation import inject_project_metadata
from .models import ExecutionRun, ExecutionStatus, ExecutionStep

logger = logging.getLogger(__name__)
settings = get_settings()


async def execute_agent(
    db: AsyncSession,
    config_provider: ConfigProvider,
    execution: ExecutionRun,
) -> AsyncIterator[dict[str, Any]]:
    """Execute a single agent (inline mode)."""
    input_data = dict(execution.input_data or {})
    raw_model_id = input_data.get("_raw_model_id")

    if raw_model_id:
        # Raw LLM mode — synthetic agent, no DB lookup
        from src.graph_engine.interfaces import AgentConfig, RAGConfig

        raw_system_prompt = input_data.get("_raw_system_prompt", "")
        raw_llm_kwargs: dict = {}
        if "_raw_temperature" in input_data:
            raw_llm_kwargs["temperature"] = float(input_data["_raw_temperature"])
        if "_raw_max_tokens" in input_data:
            raw_llm_kwargs["max_tokens"] = int(input_data["_raw_max_tokens"])
        agent = AgentConfig(
            id="__raw__",
            name="Raw LLM",
            model_id=raw_model_id,
            system_prompt=raw_system_prompt,
            memory_enabled=False,
            rag_config=RAGConfig(enabled=False),
            capabilities=[],
            gateway_permissions=None,
        )
        input_data["_raw_llm_kwargs"] = raw_llm_kwargs
    else:
        agent = await config_provider.get_agent_config(execution.agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {execution.agent_id}")

    # Validate model is in the catalog (soft check — log warning but allow)
    models = await config_provider.list_models()
    if models and not config_provider.is_model_allowed(agent.model_id):
        logger.warning(
            "Model '%s' is not in the catalog. Agent %s may fail if the model is unavailable.",
            agent.model_id,
            execution.agent_id,
        )

    # Get LLM provider — parse model_id with known-provider check
    if ":" in agent.model_id:
        _prefix, _rest = agent.model_id.split(":", 1)
        provider_name, model_name = (
            (_prefix.lower(), _rest)
            if _prefix.lower() in _KNOWN_PROVIDERS
            else ("ollama", agent.model_id)
        )
    else:
        provider_name, _ = "ollama", agent.model_id
    provider_kwargs: dict[str, Any] = {}
    if provider_name == "ollama":
        provider_kwargs["base_url"] = settings.OLLAMA_BASE_URL
    llm_provider = get_llm_provider(provider_name, **provider_kwargs)

    # Create compiler and compile agent graph
    compiler = GraphCompiler(
        config_provider, llm_provider, mcp_registry=get_mcp_registry()
    )
    raw_llm_kwargs = input_data.get("_raw_llm_kwargs", {})
    graph = await compiler.compile_agent_graph(agent, llm_kwargs=raw_llm_kwargs)

    # Build memory/RAG context layers for the agent
    from src.prompt_layers.context import AgentContextBuilder, ContextBuildParams

    context_builder = AgentContextBuilder()
    system_prompt_chars = len(agent.system_prompt or "")
    is_delegated = input_data.get("routing_strategy") == "DELEGATE_AGENT"
    skip_history = is_delegated or not getattr(
        agent, "include_conversation_history", True
    )
    context_params = ContextBuildParams(
        agent=agent,
        query=execution.input_prompt,
        session=db,
        user_id=execution.user_id,
        conversation_id=execution.session_id,
        model_id=agent.model_id,
        system_prompt_chars=system_prompt_chars,
        skip_history=skip_history,
    )
    context_messages = await context_builder.build_context_messages(context_params)

    input_data = dict(execution.input_data or {})
    if context_messages:
        input_data["_context_layers"] = [msg.content for msg in context_messages]

    history_budget = context_builder.last_history_budget
    if history_budget.get("budget_exceeded") and execution.session_id:
        yield {
            "type": "trace:compaction_start",
            "message_count": history_budget.get("included_count", 0),
        }
        try:
            from src.conversations.compaction import CompactionService

            compaction_svc = CompactionService(db)
            compact_result = await compaction_svc.compact(
                conversation_id=execution.session_id,
                model_id=agent.model_id,
                user_id=execution.user_id,
            )
            yield {"type": "trace:compaction_end", **compact_result}

            if compact_result.get("compacted_count", 0) > 0:
                context_messages = await context_builder.build_context_messages(context_params)
                if context_messages:
                    input_data["_context_layers"] = [msg.content for msg in context_messages]
        except Exception as e:  # Resilience: compaction failure must not block execution
            logger.warning("Auto-compaction failed for %s: %s", execution.session_id, e)
            yield {"type": "trace:compaction_end", "error": str(e)}

    # Emit conversation history trace event
    history_count = context_builder.get_history_message_count()
    if history_count:
        yield {
            "type": "trace:context",
            "source": "conversation_history",
            "message_count": history_count,
        }

    # Emit knowledge trace event for the frontend right panel
    rag_results = context_builder.get_rag_results()
    if rag_results:
        data = rag_results[0]
        yield {
            "type": "trace:knowledge",
            "collections": data["collections"],
            "chunks": data["chunks"],
            "total_results": data["total_results"],
        }

    # Emit context trace event for the frontend right panel
    context_details = context_builder.get_context_details()
    yield {
        "type": "trace:memory",
        "history": context_details["history"],
        "user_profile": context_details["user_profile"],
        "budget_overview": context_details["budget_overview"],
    }

    # Create initial state (user_id in metadata for built-in tool access)
    state = create_initial_state(
        prompt=execution.input_prompt,
        input_data=input_data,
        messages=[HumanMessage(content=execution.input_prompt)],
    )
    state["metadata"]["user_id"] = execution.user_id
    await inject_project_metadata(db, execution.session_id, state)

    # Create step record
    step = ExecutionStep(
        id=str(uuid4()),
        run_id=execution.id,
        step_number=1,
        node_id="agent",
        node_type="agent",
        status=ExecutionStatus.RUNNING,
        input_data={"prompt": execution.input_prompt},
        started_at=utcnow(),
    )
    db.add(step)
    await db.flush()

    is_raw = agent.id == "__raw__"

    yield {
        "type": "step",
        "event": "step_started",
        "step_id": step.id,
        "step_number": 1,
        "node_id": "agent",
        "node_type": "agent",
        "status": "running",
        "output": None,
        "timestamp": utcnow().isoformat(),
        "agent_name": agent.name,
        "input_prompt": execution.input_prompt,
        "model": agent.model_id,
        "raw_mode": is_raw,
    }

    # Set up trace handler to capture LLM/tool/chain events during execution.
    # The handler's publish_fn pushes events into an asyncio.Queue which we
    # drain concurrently while the graph executes.
    from src.graph_engine.callbacks import ExecutionTraceHandler

    trace_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def _enqueue_trace(event: dict[str, Any]) -> None:
        trace_queue.put_nowait(event)

    trace_handler = ExecutionTraceHandler(
        execution_id=execution.id,
        publish_fn=_enqueue_trace,
    )

    # Execute with callbacks so LLM/tool/chain events are captured
    config = {
        "configurable": {"thread_id": execution.id},
        "callbacks": [trace_handler],
    }

    # Run graph.ainvoke as background task so we can drain trace events
    # in real-time as the callbacks fire during LLM/tool calls.
    invoke_task = asyncio.create_task(graph.ainvoke(state, config))

    while not invoke_task.done():
        try:
            event = await asyncio.wait_for(
                trace_queue.get(),
                timeout=0.5,
            )
            yield event
        except TimeoutError:
            continue

    # Re-raise if the graph task failed
    result = invoke_task.result()

    # Drain any remaining events
    while not trace_queue.empty():
        yield trace_queue.get_nowait()

    # Get response
    messages = result.get("messages", [])
    response = messages[-1].content if messages else ""
    node_outputs = result.get("node_outputs", {})

    # Update step
    step.status = ExecutionStatus.COMPLETED
    step.completed_at = utcnow()
    step.duration_ms = int((step.completed_at - step.started_at).total_seconds() * 1000)
    step.output_data = {"response": response}
    step.tokens_prompt = trace_handler.tokens.prompt_tokens
    step.tokens_completion = trace_handler.tokens.completion_tokens

    # Update execution with token counts
    execution.output_data = {"response": response, "node_outputs": node_outputs}
    execution.tokens_prompt = trace_handler.tokens.prompt_tokens
    execution.tokens_completion = trace_handler.tokens.completion_tokens

    # Emit accumulated token usage
    if trace_handler.tokens.total > 0:
        yield {
            "type": "tokens",
            "prompt_tokens": trace_handler.tokens.prompt_tokens,
            "completion_tokens": trace_handler.tokens.completion_tokens,
            "total_tokens": trace_handler.tokens.total,
        }

    yield {
        "type": "step",
        "event": "step_completed",
        "step_id": step.id,
        "step_number": 1,
        "node_id": "agent",
        "node_type": "agent",
        "status": "completed",
        "output": {"response": response[:OUTPUT_TRUNCATION_LENGTH]},
        "timestamp": utcnow().isoformat(),
        "duration_ms": step.duration_ms,
        "agent_name": agent.name,
        "agent_response": response[:SSE_CONTENT_LENGTH],
        "raw_mode": is_raw,
    }
