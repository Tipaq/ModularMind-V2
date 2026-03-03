"""
Execution service.

Handles agent and graph execution using modularmind-core.
Supports distributed execution via Redis Streams and inline (legacy) mode.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import get_config_provider
from src.graph_engine import GraphCompiler, create_initial_state
from src.infra.config import get_settings
from src.infra.constants import KNOWN_PROVIDERS as _KNOWN_PROVIDERS
from src.infra.constants import OUTPUT_TRUNCATION_LENGTH
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
            self.config_provider.get_config_version_number("agent", agent_id)
            if agent_id
            else None
        )
        hash_value = (
            self.config_provider.get_config_version("agent", agent_id)
            if agent_id
            else None
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
            execution.id, conversation_id,
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
            raise ValueError(
                "SUPERVISOR executions are tracking records only — not dispatchable"
            )

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
            execution.id, msg_id,
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
        self, execution_id: str, last_seq: int = 0,
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
        result = await self.db.execute(
            select(ExecutionRun).where(ExecutionRun.id == execution_id)
        )
        execution = result.scalar_one_or_none()

        if not execution:
            yield {"type": "error", "code": "not_found", "message": "Execution not found"}
            return

        # Update status
        execution.status = ExecutionStatus.RUNNING
        execution.started_at = datetime.now(UTC).replace(tzinfo=None)
        await self.db.flush()

        try:
            async with asyncio.timeout(settings.MAX_EXECUTION_TIMEOUT):
                if execution.execution_type == ExecutionType.AGENT:
                    async for event in self.execute_agent(execution):
                        yield event
                else:
                    async for event in self.execute_graph(execution):
                        yield event

            # Mark complete
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.now(UTC).replace(tzinfo=None)

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

        except TimeoutError:
            logger.error("Execution %s timed out after %ds", execution_id, settings.MAX_EXECUTION_TIMEOUT)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = f"Execution timed out after {settings.MAX_EXECUTION_TIMEOUT}s"
            execution.completed_at = datetime.now(UTC).replace(tzinfo=None)

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

        except Exception as e:
            logger.exception("Execution %s failed: %s", execution_id, e)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = datetime.now(UTC).replace(tzinfo=None)

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
            await self.db.flush()

    async def execute_agent(
        self,
        execution: ExecutionRun,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a single agent (inline mode)."""
        agent = await self.config_provider.get_agent_config(execution.agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {execution.agent_id}")

        # Validate model is in the catalog (soft check — log warning but allow)
        models = await self.config_provider.list_models()
        if models and not self.config_provider.is_model_allowed(agent.model_id):
            logger.warning(
                "Model '%s' is not in the catalog. "
                "Agent %s may fail if the model is unavailable.",
                agent.model_id, execution.agent_id,
            )

        # Get LLM provider — parse model_id with known-provider check
        if ":" in agent.model_id:
            _prefix, _rest = agent.model_id.split(":", 1)
            provider_name, model_name = (_prefix.lower(), _rest) if _prefix.lower() in _KNOWN_PROVIDERS else ("ollama", agent.model_id)
        else:
            provider_name, _ = "ollama", agent.model_id
        llm_provider = get_llm_provider(provider_name)

        # Create compiler and compile agent graph
        compiler = GraphCompiler(self.config_provider, llm_provider, mcp_registry=get_mcp_registry())
        graph = await compiler.compile_agent_graph(agent)

        # Build memory/RAG context layers for the agent
        from src.prompt_layers.context import AgentContextBuilder

        context_builder = AgentContextBuilder()
        context_messages = await context_builder.build_context_messages(
            agent=agent,
            query=execution.input_prompt,
            session=self.db,
            user_id=execution.user_id,
        )

        input_data = dict(execution.input_data or {})
        if context_messages:
            input_data["_context_layers"] = [msg.content for msg in context_messages]

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

        # Create initial state
        state = create_initial_state(
            prompt=execution.input_prompt,
            input_data=input_data,
            messages=[HumanMessage(content=execution.input_prompt)],
        )

        # Create step record
        step = ExecutionStep(
            id=str(uuid4()),
            run_id=execution.id,
            step_number=1,
            node_id="agent",
            node_type="agent",
            status=ExecutionStatus.RUNNING,
            input_data={"prompt": execution.input_prompt},
            started_at=datetime.now(UTC).replace(tzinfo=None),
        )
        self.db.add(step)
        await self.db.flush()

        yield {
            "type": "step",
            "step_id": step.id,
            "step_number": 1,
            "node_id": "agent",
            "node_type": "agent",
            "status": "running",
            "output": None,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Execute
        config = {"configurable": {"thread_id": execution.id}}
        result = await graph.ainvoke(state, config)

        # Get response
        messages = result.get("messages", [])
        response = messages[-1].content if messages else ""
        node_outputs = result.get("node_outputs", {})

        # Update step
        step.status = ExecutionStatus.COMPLETED
        step.completed_at = datetime.now(UTC).replace(tzinfo=None)
        step.duration_ms = int((step.completed_at - step.started_at).total_seconds() * 1000)
        step.output_data = {"response": response}

        # Update execution
        execution.output_data = {"response": response, "node_outputs": node_outputs}

        yield {
            "type": "step",
            "step_id": step.id,
            "step_number": 1,
            "node_id": "agent",
            "node_type": "agent",
            "status": "completed",
            "output": {"response": response[:OUTPUT_TRUNCATION_LENGTH]},
            "timestamp": datetime.now(UTC).isoformat(),
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
        llm_provider = get_llm_provider("ollama")

        # Create compiler and compile graph
        compiler = GraphCompiler(self.config_provider, llm_provider, mcp_registry=get_mcp_registry())
        graph = await compiler.compile_graph(graph_config)

        # Create initial state
        state = create_initial_state(
            prompt=execution.input_prompt,
            input_data=execution.input_data,
            messages=[HumanMessage(content=execution.input_prompt)],
        )

        # Execute with streaming (with timeout to prevent infinite blocking)
        step_number = 0
        config = {"configurable": {"thread_id": execution.id}}

        async for event in graph.astream(state, config):
            step_number += 1

            for node_id, output in event.items():
                step = ExecutionStep(
                    id=str(uuid4()),
                    run_id=execution.id,
                    step_number=step_number,
                    node_id=node_id,
                    node_type="node",
                    status=ExecutionStatus.COMPLETED,
                    output_data=output if isinstance(output, dict) else {"value": str(output)},
                    started_at=datetime.now(UTC).replace(tzinfo=None),
                    completed_at=datetime.now(UTC).replace(tzinfo=None),
                )
                self.db.add(step)

                yield {
                    "type": "step",
                    "step_id": step.id,
                    "step_number": step_number,
                    "node_id": node_id,
                    "node_type": "node",
                    "status": "completed",
                    "output": output if isinstance(output, dict) else {"value": str(output)[:OUTPUT_TRUNCATION_LENGTH]},
                    "timestamp": datetime.now(UTC).isoformat(),
                }

        # Get final state
        final_state = await graph.aget_state(config)
        execution.output_data = dict(final_state.values) if final_state else {}

    async def get_execution(self, execution_id: str) -> ExecutionRun | None:
        """Get execution by ID."""
        result = await self.db.execute(
            select(ExecutionRun).where(ExecutionRun.id == execution_id)
        )
        return result.scalar_one_or_none()
