"""
Execution service.

Handles agent and graph execution using modularmind-core.
Supports distributed execution via Redis Streams and inline (legacy) mode.
"""

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import get_config_provider
from src.graph_engine import GraphCompiler, create_initial_state
from src.infra.config import get_settings
from src.infra.constants import KNOWN_PROVIDERS as _KNOWN_PROVIDERS
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH, SSE_CONTENT_LENGTH
from src.infra.utils import utcnow
from src.llm import get_llm_provider
from src.mcp.service import get_mcp_registry

from .models import ExecutionRun, ExecutionStatus, ExecutionStep, ExecutionType
from .schemas import ExecutionCreate

logger = logging.getLogger(__name__)
settings = get_settings()

# Revoke intent TTL: must exceed time_limit + 60s to prevent race condition
_REVOKE_INTENT_TTL = settings.MAX_EXECUTION_TIMEOUT + 120


class ExecutionService:
    """Service for executing agents and graphs."""

    def __init__(self, db: AsyncSession):
        """Initialize execution service.

        Args:
            db: Database session
        """
        self.db = db
        self.config_provider = get_config_provider()

    async def start_agent_execution(
        self,
        agent_id: str,
        data: ExecutionCreate,
        user_id: str,
    ) -> ExecutionRun:
        """Start an agent execution.

        Args:
            agent_id: Agent ID to execute
            data: Execution parameters
            user_id: User initiating the execution

        Returns:
            Created ExecutionRun

        Raises:
            ValueError: If agent not found
        """
        # Get agent config
        agent = await self.config_provider.get_agent_config(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")

        # Get config version info
        version_number = self.config_provider.get_config_version_number("agent", agent_id)
        hash_value = self.config_provider.get_config_version("agent", agent_id)

        # Create execution record
        execution = ExecutionRun(
            id=str(uuid4()),
            execution_type=ExecutionType.AGENT,
            agent_id=agent_id,
            session_id=data.session_id,
            user_id=user_id,
            status=ExecutionStatus.PENDING,
            config_version=version_number,
            config_hash=hash_value,
            input_prompt=data.prompt,
            input_data=data.input_data or {},
            model=getattr(agent, "model_id", None),
        )

        self.db.add(execution)
        await self.db.flush()
        await self.db.refresh(execution)

        logger.info("Created execution %s for agent %s", execution.id, agent_id)
        return execution

    async def start_raw_execution(
        self,
        model_id: str,
        data: ExecutionCreate,
        user_id: str,
    ) -> ExecutionRun:
        """Start a raw LLM execution (no agent, direct model call)."""
        execution = ExecutionRun(
            id=str(uuid4()),
            execution_type=ExecutionType.AGENT,
            agent_id=None,
            session_id=data.session_id,
            user_id=user_id,
            status=ExecutionStatus.PENDING,
            input_prompt=data.prompt,
            input_data={
                **(data.input_data or {}),
                "_raw_model_id": model_id,
            },
            model=model_id,
        )

        self.db.add(execution)
        await self.db.flush()
        await self.db.refresh(execution)

        logger.info("Created raw LLM execution %s with model %s", execution.id, model_id)
        return execution

    async def start_graph_execution(
        self,
        graph_id: str,
        data: ExecutionCreate,
        user_id: str,
    ) -> ExecutionRun:
        """Start a graph execution.

        Args:
            graph_id: Graph ID to execute
            data: Execution parameters
            user_id: User initiating the execution

        Returns:
            Created ExecutionRun

        Raises:
            ValueError: If graph not found
        """
        # Get graph config
        graph = await self.config_provider.get_graph_config(graph_id)
        if not graph:
            raise ValueError(f"Graph not found: {graph_id}")

        version_number = self.config_provider.get_config_version_number("graph", graph_id)
        hash_value = self.config_provider.get_config_version("graph", graph_id)

        execution = ExecutionRun(
            id=str(uuid4()),
            execution_type=ExecutionType.GRAPH,
            graph_id=graph_id,
            session_id=data.session_id,
            user_id=user_id,
            status=ExecutionStatus.PENDING,
            config_version=version_number,
            config_hash=hash_value,
            input_prompt=data.prompt,
            input_data=data.input_data or {},
        )

        self.db.add(execution)
        await self.db.flush()
        await self.db.refresh(execution)

        logger.info("Created execution %s for graph %s", execution.id, graph_id)
        return execution

    async def start_supervisor_execution(
        self,
        conversation_id: str,
        input_prompt: str,
        user_id: str,
        agent_id: str | None = None,
    ) -> ExecutionRun:
        """Create an ExecutionRun typed as SUPERVISOR for tracking/analytics.

        This is a lightweight parent record — the actual work runs in
        AGENT/GRAPH sub-executions. SUPERVISOR records are tracking records only.

        Args:
            conversation_id: The conversation this execution belongs to
            input_prompt: The user message that triggered routing
            user_id: User who initiated the execution
            agent_id: Optional agent ID if routing to a specific agent
        """
        version_number = (
            self.config_provider.get_config_version_number("agent", agent_id) if agent_id else None
        )
        hash_value = (
            self.config_provider.get_config_version("agent", agent_id) if agent_id else None
        )

        execution = ExecutionRun(
            id=str(uuid4()),
            execution_type=ExecutionType.SUPERVISOR,
            agent_id=agent_id,
            session_id=conversation_id,
            user_id=user_id,
            status=ExecutionStatus.PENDING,
            config_version=version_number,
            config_hash=hash_value,
            input_prompt=input_prompt,
            input_data={},
        )

        self.db.add(execution)
        await self.db.flush()
        await self.db.refresh(execution)

        logger.info(
            "Created supervisor execution %s for conversation %s",
            execution.id,
            conversation_id,
        )
        return execution

    # =========================================================================
    # Redis Streams execution dispatch
    # =========================================================================

    async def dispatch_execution(
        self,
        execution: ExecutionRun,
        *,
        ab_model_override: str | None = None,
    ) -> str:
        """Dispatch execution to worker via Redis Streams.

        Args:
            execution: ExecutionRun record (must be committed to DB first)
            ab_model_override: Optional model override from A/B testing

        Returns:
            Redis Stream message ID
        """
        from src.infra.publish import enqueue_execution

        if execution.execution_type == ExecutionType.SUPERVISOR:
            raise ValueError("SUPERVISOR executions are tracking records only — not dispatchable")

        msg_id = await enqueue_execution(
            execution_id=execution.id,
            execution_type=execution.execution_type.value,
            agent_id=execution.agent_id,
            graph_id=execution.graph_id,
            input_prompt=execution.input_prompt,
            input_data=execution.input_data,
            user_id=execution.user_id,
            ab_model_override=ab_model_override,
        )

        # Store stream task ID for tracking
        await self.db.execute(
            update(ExecutionRun)
            .where(ExecutionRun.id == execution.id)
            .values(stream_task_id=msg_id)
        )
        execution.stream_task_id = msg_id

        logger.info(
            "Dispatched execution %s to Redis Streams (msg=%s)",
            execution.id,
            msg_id,
        )
        return msg_id

    async def stop_execution(self, execution_id: str) -> bool:
        """Stop a running execution via Redis cancel intent key."""
        execution = await self.get_execution(execution_id)
        if not execution:
            return False
        if execution.status not in (ExecutionStatus.PENDING, ExecutionStatus.RUNNING):
            return False

        from src.infra.redis import get_redis_client

        redis = await get_redis_client()
        if redis:
            try:
                await redis.set(
                    f"revoke_intent:{execution_id}",
                    "cancel",
                    ex=_REVOKE_INTENT_TTL,
                )
            finally:
                await redis.aclose()

        logger.info("Sent cancel intent for execution %s", execution_id)
        return True

    async def pause_execution(self, execution_id: str) -> bool:
        """Pause a running execution via Redis pause intent key."""
        execution = await self.get_execution(execution_id)
        if not execution:
            return False
        if execution.status != ExecutionStatus.RUNNING:
            return False

        from src.infra.redis import get_redis_client

        redis = await get_redis_client()
        if redis:
            try:
                await redis.set(
                    f"revoke_intent:{execution_id}",
                    "pause",
                    ex=_REVOKE_INTENT_TTL,
                )
            finally:
                await redis.aclose()

        logger.info("Sent pause intent for execution %s", execution_id)
        return True

    async def resume_execution(self, execution_id: str) -> ExecutionRun | None:
        """Resume a paused or approved execution by dispatching a new task."""
        execution = await self.get_execution(execution_id)
        if not execution:
            return None
        if execution.status not in (ExecutionStatus.PAUSED, ExecutionStatus.PENDING):
            return None

        execution.status = ExecutionStatus.PENDING
        await self.db.flush()

        await self.dispatch_execution(execution)
        await self.db.flush()

        logger.info("Resumed execution %s", execution_id)
        return execution

    async def get_execution_events(
        self,
        execution_id: str,
        last_seq: int = 0,
    ) -> list[dict[str, Any]]:
        """Get buffered events for polling clients.

        Reads from Redis buffer list and filters by sequence number.

        Args:
            execution_id: Execution ID
            last_seq: Last seen sequence number (filter events > last_seq)

        Returns:
            List of events after last_seq
        """
        from src.infra.redis import get_redis_client

        redis = await get_redis_client()
        if not redis:
            return []

        try:
            buffer_key = f"buffer:{execution_id}"
            raw_events = await redis.lrange(buffer_key, 0, -1)

            events = []
            for raw in raw_events:
                try:
                    event = json.loads(raw)
                    if event.get("seq", 0) > last_seq:
                        events.append(event)
                except (json.JSONDecodeError, TypeError):
                    continue

            return events
        finally:
            await redis.aclose()

    # =========================================================================
    # Inline execution (legacy — behind EXECUTION_MODE=inline feature flag)
    # =========================================================================

    async def execute(
        self,
        execution_id: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute and stream results (inline mode only).

        Preserved for EXECUTION_MODE=inline rollback path.
        In distributed mode, execution happens in worker tasks — this is not called.

        Args:
            execution_id: Execution ID to run

        Yields:
            Execution events (steps, tokens, completion)
        """
        # Get execution
        result = await self.db.execute(select(ExecutionRun).where(ExecutionRun.id == execution_id))
        execution = result.scalar_one_or_none()

        if not execution:
            yield {"type": "error", "code": "not_found", "message": "Execution not found"}
            return

        # Update status
        execution.status = ExecutionStatus.RUNNING
        execution.started_at = utcnow()
        await self.db.flush()

        try:
            # Graph executions with approval gates need no timeout (human is in the loop)
            timeout: float | None = settings.MAX_EXECUTION_TIMEOUT
            if execution.execution_type == ExecutionType.GRAPH:
                graph_config = await self.config_provider.get_graph_config(execution.graph_id)
                has_approval = graph_config and any(
                    n.type == "approval" for n in graph_config.nodes
                )
                timeout = None if has_approval else min(timeout * 3, 3600)
                node_types = [n.type for n in graph_config.nodes] if graph_config else []
                logger.info(
                    "Execution %s: graph=%s has_approval=%s timeout=%s node_types=%s",
                    execution_id, execution.graph_id, has_approval, timeout, node_types,
                )

            # Use a sentinel to distinguish execution-level timeout from internal ones
            _execution_timed_out = False
            try:
                async with asyncio.timeout(timeout):
                    if execution.execution_type == ExecutionType.AGENT:
                        async for event in self.execute_agent(execution):
                            yield event
                    else:
                        async for event in self.execute_graph(execution):
                            yield event
            except TimeoutError:
                if timeout is None:
                    # timeout=None means asyncio.timeout never fires — this is an
                    # internal TimeoutError (Redis/DB/HTTP), re-raise as generic error
                    raise RuntimeError(
                        "Internal timeout during execution (not execution-level)"
                    ) from None
                _execution_timed_out = True

            if _execution_timed_out:
                logger.error(
                    "Execution %s timed out after %ds", execution_id, timeout
                )
                execution.status = ExecutionStatus.FAILED
                execution.error_message = f"Execution timed out after {timeout}s"
                execution.completed_at = utcnow()

                yield {
                    "type": "complete",
                    "execution_id": execution.id,
                    "status": execution.status.value,
                    "output": None,
                    "error": execution.error_message,
                    "duration_ms": int(
                        (execution.completed_at - execution.started_at).total_seconds() * 1000
                    ),
                }
            else:
                # Mark complete
                execution.status = ExecutionStatus.COMPLETED
                execution.completed_at = utcnow()

                yield {
                    "type": "complete",
                    "execution_id": execution.id,
                    "status": execution.status.value,
                    "output": execution.output_data,
                    "error": None,
                    "duration_ms": int(
                        (execution.completed_at - execution.started_at).total_seconds() * 1000
                    ),
                }

        except Exception as e:  # Resilience: catch-all for LLM, graph, and DB errors in execution
            logger.exception("Execution %s failed: %s", execution_id, e)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = utcnow()

            yield {
                "type": "complete",
                "execution_id": execution.id,
                "status": execution.status.value,
                "output": None,
                "error": str(e),
                "duration_ms": int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                ),
            }

        finally:
            with contextlib.suppress(Exception):
                # Session may already be flushing from caller's commit
                await self.db.flush()

    async def execute_agent(
        self,
        execution: ExecutionRun,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a single agent (inline mode)."""
        input_data = dict(execution.input_data or {})
        raw_model_id = input_data.get("_raw_model_id")

        if raw_model_id:
            # Raw LLM mode — synthetic agent, no DB lookup
            from src.graph_engine.interfaces import AgentConfig, RAGConfig

            raw_system_prompt = input_data.get("_raw_system_prompt", "")
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
        else:
            agent = await self.config_provider.get_agent_config(execution.agent_id)
            if not agent:
                raise ValueError(f"Agent not found: {execution.agent_id}")

        # Validate model is in the catalog (soft check — log warning but allow)
        models = await self.config_provider.list_models()
        if models and not self.config_provider.is_model_allowed(agent.model_id):
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
            self.config_provider, llm_provider, mcp_registry=get_mcp_registry()
        )
        graph = await compiler.compile_agent_graph(agent)

        # Build memory/RAG context layers for the agent
        from src.prompt_layers.context import AgentContextBuilder

        context_builder = AgentContextBuilder()
        system_prompt_chars = len(agent.system_prompt or "")
        context_messages = await context_builder.build_context_messages(
            agent=agent,
            query=execution.input_prompt,
            session=self.db,
            user_id=execution.user_id,
            conversation_id=execution.session_id,
            model_id=agent.model_id,
            system_prompt_chars=system_prompt_chars,
        )

        input_data = dict(execution.input_data or {})
        if context_messages:
            input_data["_context_layers"] = [msg.content for msg in context_messages]

        # Auto-compact if history budget exceeded (Claude-style inline compaction)
        history_budget = context_builder.last_history_budget
        if history_budget.get("budget_exceeded") and execution.session_id:
            yield {
                "type": "trace:compaction_start",
                "message_count": history_budget.get("included_count", 0),
            }
            try:
                from src.conversations.compaction import CompactionService

                compaction_svc = CompactionService(self.db)
                compact_result = await compaction_svc.compact(
                    conversation_id=execution.session_id,
                    model_id=agent.model_id,
                    user_id=execution.user_id,
                )
                yield {"type": "trace:compaction_end", **compact_result}

                # Re-build context with the compacted history
                if compact_result.get("compacted_count", 0) > 0:
                    context_messages = await context_builder.build_context_messages(
                        agent=agent,
                        query=execution.input_prompt,
                        session=self.db,
                        user_id=execution.user_id,
                        conversation_id=execution.session_id,
                        model_id=agent.model_id,
                        system_prompt_chars=system_prompt_chars,
                    )
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
        self.db.add(step)
        await self.db.flush()

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

    async def execute_graph(
        self,
        execution: ExecutionRun,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a graph (inline mode)."""
        graph_config = await self.config_provider.get_graph_config(execution.graph_id)
        if not graph_config:
            raise ValueError(f"Graph not found: {execution.graph_id}")

        # Get LLM provider (use default)
        llm_provider = get_llm_provider("ollama", base_url=settings.OLLAMA_BASE_URL)

        # Create compiler and compile graph
        compiler = GraphCompiler(
            self.config_provider, llm_provider, mcp_registry=get_mcp_registry()
        )
        graph = await compiler.compile_graph(graph_config)

        # Create initial state
        state = create_initial_state(
            prompt=execution.input_prompt,
            input_data=execution.input_data,
            messages=[HumanMessage(content=execution.input_prompt)],
        )

        # Set up trace handler — events go into a merged queue for real-time streaming
        from src.graph_engine.callbacks import ExecutionTraceHandler

        merged_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        def _enqueue_trace(event: dict[str, Any]) -> None:
            merged_queue.put_nowait(event)

        trace_handler = ExecutionTraceHandler(
            execution_id=execution.id,
            publish_fn=_enqueue_trace,
        )

        # Emit graph start event
        yield {
            "type": "trace:graph_start",
            "graph_id": graph_config.id,
            "graph_name": graph_config.name,
            "node_count": len(graph_config.nodes),
            "edge_count": len(graph_config.edges),
        }

        # Build node info map for agent name resolution + model lookup
        node_info: dict[str, dict[str, Any]] = {}
        for n in graph_config.nodes:
            agent_id = (
                n.data.get("agent_id")
                or n.data.get("config", {}).get("agentId")
                or n.data.get("config", {}).get("agent_id")
            )
            agent_cfg = await self.config_provider.get_agent_config(agent_id) if agent_id else None
            node_info[n.id] = {
                "label": n.data.get("label", n.id),
                "type": n.type,
                "agent_id": agent_id,
                "model_id": agent_cfg.model_id if agent_cfg else None,
            }

        # Notifier: called by agent_node at the START of execution (before LLM call)
        def _node_started(nid: str, model: str | None) -> None:
            info = node_info.get(nid)
            if info and info["type"] not in ("start", "end"):
                merged_queue.put_nowait({
                    "_type": "step_started",
                    "node_id": nid,
                    "agent_name": info.get("label", nid),
                    "model": model or info.get("model_id"),
                })

        config = {
            "configurable": {
                "thread_id": execution.id,
                "_node_started_fn": _node_started,
            },
            "callbacks": [trace_handler],
        }

        # Run astream in a background task so trace events arrive in real-time
        step_number = 0
        stream_error: Exception | None = None
        db_ref = self.db

        async def _run_stream() -> None:
            nonlocal step_number, stream_error
            try:
                async for event in graph.astream(state, config, stream_mode="updates"):
                    step_number += 1
                    for nid, output in event.items():
                        if nid.startswith("__"):
                            continue
                        info = node_info.get(nid)
                        if not info or info["type"] in ("start", "end"):
                            continue
                        merged_queue.put_nowait({
                            "_type": "node_completed",
                            "node_id": nid,
                            "output": output,
                            "step_number": step_number,
                        })
            except Exception as e:
                stream_error = e
            finally:
                merged_queue.put_nowait({"_type": "stream_done"})

        stream_task = asyncio.create_task(_run_stream())

        # Consume merged queue — yields events in real-time
        while True:
            event = await merged_queue.get()

            internal_type = event.get("_type")

            if internal_type == "stream_done":
                break

            # Agent node started (from _node_started_fn callback)
            if internal_type == "step_started":
                yield {
                    "type": "step",
                    "event": "step_started",
                    "agent_name": event["agent_name"],
                    "node_id": event["node_id"],
                    "model": event.get("model"),
                }
                continue

            # Agent node completed (from astream)
            if internal_type == "node_completed":
                nid = event["node_id"]
                output = event["output"]
                info = node_info[nid]
                node_label = info.get("label", nid)
                node_type = info.get("type", "node")

                # Extract input prompt and agent response
                input_prompt = None
                agent_response = None
                if isinstance(output, dict):
                    msgs = output.get("messages", [])
                    for m in reversed(msgs):
                        if hasattr(m, "type") and m.type == "human" and hasattr(m, "content"):
                            input_prompt = str(m.content)[:SSE_CONTENT_LENGTH]
                            break
                    for m in reversed(msgs):
                        if hasattr(m, "type") and m.type == "ai" and hasattr(m, "content"):
                            agent_response = str(m.content)[:SSE_CONTENT_LENGTH]
                            break
                    if not agent_response:
                        node_outputs = output.get("node_outputs", {})
                        for v in node_outputs.values():
                            if isinstance(v, dict) and "response" in v:
                                agent_response = str(v["response"])[:SSE_CONTENT_LENGTH]
                                break

                # Serialize output for DB
                safe_output: dict[str, Any] = {}
                if isinstance(output, dict):
                    for k, v in output.items():
                        if k == "messages":
                            safe_output[k] = [
                                {
                                    "role": getattr(m, "type", "unknown"),
                                    "content": str(getattr(m, "content", m)),
                                }
                                if hasattr(m, "content") else str(m)
                                for m in v
                            ] if isinstance(v, list) else str(v)
                        else:
                            try:
                                import json
                                json.dumps(v)
                                safe_output[k] = v
                            except (TypeError, ValueError):
                                safe_output[k] = str(v)[:OUTPUT_TRUNCATION_LENGTH]
                else:
                    safe_output = {"value": str(output)[:OUTPUT_TRUNCATION_LENGTH]}

                step = ExecutionStep(
                    id=str(uuid4()),
                    run_id=execution.id,
                    step_number=event["step_number"],
                    node_id=nid,
                    node_type=node_type,
                    status=ExecutionStatus.COMPLETED,
                    output_data=safe_output,
                    started_at=utcnow(),
                    completed_at=utcnow(),
                )
                db_ref.add(step)

                yield {
                    "type": "step",
                    "event": "step_completed",
                    "agent_name": node_label,
                    "node_id": nid,
                    "agent_response": agent_response,
                    "input_prompt": input_prompt,
                }
                continue

            # Trace events (llm_start, llm_end, tool_start, etc.) — pass through
            yield event

        await stream_task
        if stream_error:
            raise stream_error

        # Emit graph end event
        yield {
            "type": "trace:graph_end",
            "graph_id": graph_config.id,
            "graph_name": graph_config.name,
        }

        # Update execution with token counts
        execution.tokens_prompt = trace_handler.tokens.prompt_tokens
        execution.tokens_completion = trace_handler.tokens.completion_tokens

        # Get final state — serialize safely (LangChain messages aren't JSON-safe)
        final_state = await graph.aget_state(config)
        if final_state and final_state.values:
            safe_final: dict[str, Any] = {}
            for k, v in dict(final_state.values).items():
                if k == "messages" and isinstance(v, list):
                    safe_final[k] = [
                        {
                            "role": getattr(m, "type", "unknown"),
                            "content": str(getattr(m, "content", m)),
                        }
                        if hasattr(m, "content") else str(m)
                        for m in v
                    ]
                else:
                    try:
                        import json
                        json.dumps(v)
                        safe_final[k] = v
                    except (TypeError, ValueError):
                        safe_final[k] = str(v)[:OUTPUT_TRUNCATION_LENGTH]
            execution.output_data = safe_final
        else:
            execution.output_data = {}

    async def get_execution(self, execution_id: str) -> ExecutionRun | None:
        """Get execution by ID."""
        result = await self.db.execute(select(ExecutionRun).where(ExecutionRun.id == execution_id))
        return result.scalar_one_or_none()
