"""
Execution service.

Thin facade that delegates to specialized modules:
- creation.py: ExecutionRun record creation
- dispatch.py: Redis Streams dispatch, stop/pause/resume, event retrieval
- agent_executor.py: Inline agent execution
- graph_executor.py: Inline graph execution

Supports distributed execution via Redis Streams and inline mode.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import get_config_provider
from src.infra.config import get_settings
from src.infra.utils import utcnow
from src.llm.errors import ExecutionError

from .agent_executor import execute_agent as _execute_agent
from .creation import (
    start_agent_execution as _start_agent_execution,
)
from .creation import (
    start_graph_execution as _start_graph_execution,
)
from .creation import (
    start_raw_execution as _start_raw_execution,
)
from .creation import (
    start_supervisor_execution as _start_supervisor_execution,
)
from .dispatch import (
    dispatch_execution as _dispatch_execution,
)
from .dispatch import (
    get_execution as _get_execution,
)
from .dispatch import (
    get_execution_events as _get_execution_events,
)
from .dispatch import (
    pause_execution as _pause_execution,
)
from .dispatch import (
    resume_execution as _resume_execution,
)
from .dispatch import (
    stop_execution as _stop_execution,
)
from .graph_executor import execute_graph as _execute_graph
from .models import ExecutionRun, ExecutionStatus, ExecutionType
from .schemas import ExecutionCreate

logger = logging.getLogger(__name__)
settings = get_settings()


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
        return await _start_agent_execution(
            self.db, self.config_provider, agent_id, data, user_id
        )

    async def start_raw_execution(
        self,
        model_id: str,
        data: ExecutionCreate,
        user_id: str,
    ) -> ExecutionRun:
        """Start a raw LLM execution (no agent, direct model call)."""
        return await _start_raw_execution(self.db, model_id, data, user_id)

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
        return await _start_graph_execution(
            self.db, self.config_provider, graph_id, data, user_id
        )

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
        return await _start_supervisor_execution(
            self.db, self.config_provider, conversation_id, input_prompt, user_id, agent_id
        )

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
        return await _dispatch_execution(
            self.db, execution, ab_model_override=ab_model_override
        )

    async def stop_execution(self, execution_id: str) -> bool:
        """Stop a running execution via Redis cancel intent key."""
        return await _stop_execution(self.db, execution_id)

    async def pause_execution(self, execution_id: str) -> bool:
        """Pause a running execution via Redis pause intent key."""
        return await _pause_execution(self.db, execution_id)

    async def resume_execution(self, execution_id: str) -> ExecutionRun | None:
        """Resume a paused or approved execution by dispatching a new task."""
        return await _resume_execution(
            self.db, execution_id, _dispatch_execution
        )

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
        return await _get_execution_events(execution_id, last_seq)

    # =========================================================================
    # Inline execution (behind EXECUTION_MODE=inline feature flag)
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
                    execution_id,
                    execution.graph_id,
                    has_approval,
                    timeout,
                    node_types,
                )

            # Use a sentinel to distinguish execution-level timeout from internal ones
            _execution_timed_out = False
            try:
                async with asyncio.timeout(timeout):
                    if execution.execution_type == ExecutionType.AGENT:
                        async for event in _execute_agent(
                            self.db, self.config_provider, execution
                        ):
                            yield event
                    else:
                        async for event in _execute_graph(
                            self.db, self.config_provider, execution
                        ):
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
                logger.error("Execution %s timed out after %ds", execution_id, timeout)
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

        except ExecutionError as err:
            from src.llm.errors import to_sse_payload

            logger.warning("Execution %s: %s", execution_id, err.user_message)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = err.user_message
            execution.completed_at = utcnow()

            duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )
            yield to_sse_payload(err) | {"execution_id": execution.id, "duration_ms": duration_ms}

        except Exception as e:  # Resilience: catch-all for LLM, graph, and DB errors
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

    async def get_execution(self, execution_id: str) -> ExecutionRun | None:
        """Get execution by ID."""
        return await _get_execution(self.db, execution_id)
