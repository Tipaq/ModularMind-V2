from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import redis.exceptions
import sqlalchemy.exc

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

import src.conversations.models  # noqa: F401 — register Conversation FK
import src.groups.models  # noqa: F401 — register UserGroupMember
from src.worker.scheduled_task_helpers import (
    update_scheduled_task_run as _update_scheduled_task_run,
)

logger = logging.getLogger(__name__)


async def graph_execution_handler(data: dict[str, Any]) -> None:
    """Execute an agent or graph workflow.

    Receives data from tasks:executions stream:
    - execution_id: str
    - execution_type: "agent" | "graph"
    - agent_id / graph_id: str
    - input_prompt: str
    - input_data: str (JSON)
    - user_id: str
    - ab_model_override: str (optional)
    """
    import asyncio

    from src.executions.scheduler import fair_scheduler
    from src.infra.config import get_settings

    execution_id = data.get("execution_id", "")
    user_id = data.get("user_id", "")
    ab_model_override = data.get("ab_model_override")
    if not execution_id:
        logger.error("graph_execution_handler: missing execution_id")
        return

    logger.info("Starting execution %s", execution_id)

    # Hard ceiling: prevents the handler from blocking the stream consumer forever
    # even if service.execute() uses timeout=None (approval graphs).
    _settings = get_settings()
    _handler_timeout = _settings.MAX_EXECUTION_TIMEOUT + 300

    try:
        async with asyncio.timeout(_handler_timeout):
            await _run_execution(data, execution_id, user_id, ab_model_override)
    except TimeoutError:
        logger.error(
            "Execution %s hit handler-level timeout (%ds), forcing failure",
            execution_id,
            _handler_timeout,
        )
        await _force_fail_execution(execution_id, f"Handler timeout after {_handler_timeout}s")
    finally:
        if user_id and execution_id:
            for _attempt in range(3):
                try:
                    await fair_scheduler.release(user_id, execution_id)
                    break
                except (ConnectionError, OSError, redis.exceptions.RedisError) as exc:
                    if _attempt == 2:
                        logger.error(
                            "Failed to release scheduler slot for %s after 3 attempts: %s",
                            execution_id,
                            exc,
                        )
                    else:
                        import asyncio as _aio
                        await _aio.sleep(0.5 * (_attempt + 1))

        if _settings.GATEWAY_ENABLED and execution_id:
            try:
                import httpx as _httpx

                from src.internal.auth import get_internal_bearer_token

                token = get_internal_bearer_token()
                async with _httpx.AsyncClient(timeout=5) as _client:
                    await _client.post(
                        f"{_settings.GATEWAY_URL}/api/v1/release/{execution_id}",
                        headers={"Authorization": token},
                    )
            except (ConnectionError, TimeoutError, OSError) as exc:
                logger.debug(
                    "Gateway sandbox release failed for %s: %s",
                    execution_id,
                    exc,
                )


async def _run_execution(
    data: dict[str, Any],
    execution_id: str,
    user_id: str,
    ab_model_override: str | None,
) -> None:
    """Inner execution logic, separated for handler-level timeout wrapping."""
    from src.executions.service import ExecutionService
    from src.infra.database import async_session_maker

    async with async_session_maker() as session:
        service = ExecutionService(session)

        # Fetch status (+ input_data if override needed) in a single query
        from sqlalchemy import select as sa_sel

        from src.executions.models import ExecutionRun as _ER
        from src.executions.models import ExecutionStatus as _ES

        _columns = [_ER.status, _ER.input_data] if ab_model_override else [_ER.status]
        _row = (await session.execute(
            sa_sel(*_columns).where(_ER.id == execution_id)
        )).first()

        if _row and _row[0] not in (_ES.PENDING, _ES.RUNNING):
            logger.info("Skipping execution %s (status=%s)", execution_id, _row[0])
            return

        if ab_model_override and _row:
            from sqlalchemy import update

            idata = dict(_row[1] or {}) if _row[1] else {}
            idata["_model_override"] = ab_model_override
            await session.execute(
                update(_ER).where(_ER.id == execution_id).values(input_data=idata)
            )
            await session.commit()
            logger.info(
                "Injected model override %s for execution %s",
                ab_model_override,
                execution_id,
            )

        complete_event: dict[str, Any] | None = None

        try:
            from src.executions.cancel import ExecutionCancelled, check_revoke_intent
            from src.infra.redis import get_redis_client

            r = await get_redis_client()
            cancelled = False
            try:
                stream_key = f"exec_stream:{execution_id}"
                async for event in service.execute(execution_id):
                    # Check for cancellation before writing each event
                    intent = await check_revoke_intent(execution_id)
                    if intent == "cancel":
                        logger.info("Execution %s cancelled by revoke_intent", execution_id)
                        cancelled = True
                        break

                    # Append events to a Redis Stream so late SSE subscribers
                    # can read from the beginning (no pub/sub race condition).
                    await r.xadd(
                        stream_key,
                        {"data": json.dumps(event, default=str)},
                    )

                    if event.get("type") == "complete":
                        complete_event = event
                        break

                if cancelled:
                    await _handle_cancellation(session, r, execution_id, stream_key)
                    await _update_scheduled_task_run(
                        execution_id,
                        "skipped",
                        error_message="Cancelled by user",
                    )
                else:
                    # Normal completion — persist assistant message
                    await _persist_assistant_message(session, execution_id, complete_event)
                    await session.commit()
                    logger.info("Execution %s completed", execution_id)

                    await _update_scheduled_task_run(execution_id, "completed", complete_event)

                # Stream auto-expires after 5 minutes (cleanup)
                await r.expire(stream_key, 300)
            finally:
                await r.aclose()

        except ExecutionCancelled:
            # Cancellation propagated from inside graph/tool_loop
            logger.info("Execution %s cancelled from graph execution", execution_id)
            from src.infra.redis import get_redis_client

            r2 = await get_redis_client()
            try:
                await _handle_cancellation(
                    session,
                    r2,
                    execution_id,
                    f"exec_stream:{execution_id}",
                )
                await r2.expire(f"exec_stream:{execution_id}", 300)
            finally:
                await r2.aclose()
            await _update_scheduled_task_run(
                execution_id,
                "skipped",
                error_message="Cancelled by user",
            )

        except (
            RuntimeError,
            ValueError,
            KeyError,
            TypeError,
            OSError,
            ConnectionError,
            TimeoutError,
            sqlalchemy.exc.SQLAlchemyError,
            redis.exceptions.RedisError,
        ):
            logger.exception("Execution %s failed", execution_id)
            from sqlalchemy import update

            from src.executions.models import ExecutionRun, ExecutionStatus
            from src.infra.utils import utcnow

            await session.execute(
                update(ExecutionRun)
                .where(ExecutionRun.id == execution_id)
                .values(
                    status=ExecutionStatus.FAILED,
                    error_message="Worker task failed unexpectedly",
                    completed_at=utcnow(),
                )
            )
            await session.commit()
            await _update_scheduled_task_run(
                execution_id,
                "failed",
                error_message="Execution failed",
            )
            raise


async def _force_fail_execution(execution_id: str, error_message: str) -> None:
    """Mark an execution as FAILED from outside the session (handler timeout)."""
    from sqlalchemy import update

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.database import async_session_maker
    from src.infra.utils import utcnow

    try:
        async with async_session_maker() as session:
            await session.execute(
                update(ExecutionRun)
                .where(ExecutionRun.id == execution_id)
                .values(
                    status=ExecutionStatus.FAILED,
                    error_message=error_message,
                    completed_at=utcnow(),
                )
            )
            await session.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to mark execution %s as FAILED", execution_id)


async def _handle_cancellation(
    session: AsyncSession,
    redis_client: Redis,
    execution_id: str,
    stream_key: str,
) -> None:
    """Mark execution as STOPPED, emit cancel event, clean up revoke intent."""
    from sqlalchemy import update

    from src.executions.models import ExecutionRun, ExecutionStatus
    from src.infra.utils import utcnow

    # Emit a cancel event to the SSE stream so the client gets a clean signal
    cancel_event = {
        "type": "complete",
        "execution_id": execution_id,
        "status": "stopped",
        "output": None,
        "error": "Execution cancelled",
        "duration_ms": None,
    }
    await redis_client.xadd(stream_key, {"data": json.dumps(cancel_event, default=str)})

    # Mark execution as STOPPED in DB
    await session.execute(
        update(ExecutionRun)
        .where(ExecutionRun.id == execution_id)
        .values(
            status=ExecutionStatus.STOPPED,
            error_message="Cancelled by user",
            completed_at=utcnow(),
        )
    )
    await session.commit()

    # Clean up the revoke_intent key
    await redis_client.delete(f"revoke_intent:{execution_id}")
    logger.info("Execution %s marked as STOPPED (cancelled)", execution_id)

    # Clean up orphaned conversations: if this was the first message in a new
    # conversation and the LLM never responded, delete the conversation entirely
    # so it doesn't linger in the sidebar with just the user's message.
    await _cleanup_orphaned_conversation(session, execution_id)


async def _cleanup_orphaned_conversation(
    session: AsyncSession,
    execution_id: str,
) -> None:
    """Delete conversation if it only has a single user message (no assistant reply).

    When a user starts a new conversation and cancels/refreshes before the LLM
    responds, the conversation is left with just the initial user message and a
    modified title. Since neither the message nor the response are visible after
    refresh, we delete the conversation to avoid sidebar clutter.
    """
    from sqlalchemy import delete, func, select

    from src.conversations.models import Conversation, ConversationMessage
    from src.executions.models import ExecutionRun

    # Find the conversation linked to this execution
    result = await session.execute(
        select(ExecutionRun.session_id).where(ExecutionRun.id == execution_id)
    )
    row = result.first()
    if not row or not row[0]:
        return

    conversation_id = row[0]

    # Count total messages in this conversation
    msg_count = (
        await session.execute(
            select(func.count())
            .select_from(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
        )
    ).scalar() or 0

    # Only delete if there's exactly 1 message (the initial user message)
    if msg_count <= 1:
        await session.execute(delete(Conversation).where(Conversation.id == conversation_id))
        await session.commit()
        logger.info(
            "Deleted orphaned conversation %s (execution %s cancelled before first response)",
            conversation_id,
            execution_id,
        )


async def _persist_assistant_message(
    session: AsyncSession,
    execution_id: str,
    complete_event: dict[str, Any] | None,
) -> None:
    """Save the assistant response as a conversation message after execution.

    This ensures execution context (routing_strategy, delegated_to, duration_ms)
    is persisted and visible after page refresh.
    """
    from sqlalchemy import select

    from src.conversations.models import MessageRole
    from src.conversations.service import ConversationService
    from src.executions.models import ExecutionRun

    result = await session.execute(select(ExecutionRun).where(ExecutionRun.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution or not execution.session_id:
        return

    # Extract response text from output_data
    output = (complete_event or {}).get("output") or execution.output_data or {}
    response = ""
    if isinstance(output, dict):
        response = output.get("response", "")
        if not response and output.get("messages"):
            for m in reversed(output["messages"]):
                if isinstance(m, dict) and m.get("type") == "ai" and m.get("content"):
                    response = m["content"]
                    break
        if not response:
            node_outputs = output.get("node_outputs", {})
            for v in reversed(list(node_outputs.values())):
                if isinstance(v, dict) and v.get("response"):
                    response = v["response"]
                    break

    if not response:
        return

    # Build metadata
    duration_ms = (complete_event or {}).get("duration_ms")
    metadata: dict[str, Any] = {"execution_id": execution_id}
    if duration_ms is not None:
        metadata["duration_ms"] = duration_ms
    if execution.agent_id:
        metadata["agent_id"] = execution.agent_id
    if execution.graph_id:
        metadata["graph_id"] = execution.graph_id

    # Resolve routing info from input_data (set by supervisor)
    input_data = execution.input_data or {}
    if input_data.get("routing_strategy"):
        metadata["routing_strategy"] = input_data["routing_strategy"]
    if input_data.get("delegated_to"):
        metadata["delegated_to"] = input_data["delegated_to"]

    conv_service = ConversationService(session)
    await conv_service.add_message(
        conversation_id=execution.session_id,
        role=MessageRole.ASSISTANT,
        content=response,
        metadata=metadata,
        execution_id=execution_id,
    )

    logger.info(
        "Persisted assistant message for execution %s in conversation %s",
        execution_id,
        execution.session_id,
    )
