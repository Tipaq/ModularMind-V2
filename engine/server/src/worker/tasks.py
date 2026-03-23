"""Task definitions — async functions consumed from Redis Streams.

Each function is an EventBus handler callback: it receives event data dict
and returns when done (or raises to trigger retry/DLQ).
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import redis.exceptions
import sqlalchemy.exc

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

import src.conversations.models  # noqa: F401 — register Conversation for ExecutionRun FK
import src.groups.models  # noqa: F401 — register UserGroupMember with SQLAlchemy mapper

logger = logging.getLogger(__name__)


# --- Execution tasks (stream: tasks:executions) ---


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
    from src.executions.scheduler import fair_scheduler
    from src.executions.service import ExecutionService
    from src.infra.database import async_session_maker

    execution_id = data.get("execution_id", "")
    user_id = data.get("user_id", "")
    ab_model_override = data.get("ab_model_override")
    if not execution_id:
        logger.error("graph_execution_handler: missing execution_id")
        return

    logger.info("Starting execution %s", execution_id)

    async with async_session_maker() as session:
        service = ExecutionService(session)

        # Inject model override into the execution's input_data so the
        # compiler picks it up via state["input_data"]["_model_override"].
        if ab_model_override:
            from sqlalchemy import select, update

            from src.executions.models import ExecutionRun

            row = (
                await session.execute(
                    select(ExecutionRun.input_data).where(ExecutionRun.id == execution_id)
                )
            ).first()
            if row:
                idata = dict(row[0] or {}) if row[0] else {}
                idata["_model_override"] = ab_model_override
                await session.execute(
                    update(ExecutionRun)
                    .where(ExecutionRun.id == execution_id)
                    .values(input_data=idata)
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

        except Exception:  # noqa: BLE001 — Worker resilience: catch all to avoid stream consumer crash
            logger.exception("Execution %s failed", execution_id)
            # Update status to FAILED
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
            raise  # Re-raise to trigger retry/DLQ

        finally:
            # Release the fair-scheduler slot so the global/team counters stay accurate.
            # This runs whether the execution succeeded, failed, or was cancelled.
            if user_id and execution_id:
                try:
                    await fair_scheduler.release(user_id, execution_id)
                except (ConnectionError, OSError, redis.exceptions.RedisError) as exc:
                    logger.warning(
                        "Failed to release scheduler slot for execution %s: %s",
                        execution_id,
                        exc,
                    )

            # Release Gateway sandbox (if any was acquired for this execution)
            from src.infra.config import get_settings

            _settings = get_settings()
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
                except Exception:
                    pass  # Cleanup scheduler handles leaked sandboxes


# --- Cancellation helper ---


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


# --- Orphaned conversation cleanup ---


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


# --- Scheduled task run status updates ---


def _extract_scheduled_task_ids(
    input_data: dict[str, Any] | None,
) -> tuple[str, str] | None:
    """Extract (task_id, run_id) from execution input_data, or None."""
    if not input_data:
        return None
    task_id = input_data.get("_scheduled_task_id", "")
    run_id = input_data.get("_scheduled_task_run_id", "")
    if not task_id or not run_id:
        return None
    return task_id, run_id


async def _update_scheduled_task_run(
    execution_id: str,
    status: str,
    complete_event: dict[str, Any] | None = None,
    error_message: str = "",
) -> None:
    """Update the ScheduledTaskRun linked to this execution."""
    from sqlalchemy import select as sa_select

    from src.executions.models import ExecutionRun
    from src.infra.database import async_session_maker

    try:
        async with async_session_maker() as session:
            result = await session.execute(
                sa_select(ExecutionRun.input_data).where(
                    ExecutionRun.id == execution_id,
                )
            )
            row = result.first()
            ids = _extract_scheduled_task_ids(row[0] if row else None)
            if not ids:
                return
            task_id, run_id = ids

        from src.infra.utils import utcnow
        from src.scheduled_tasks.models import (
            ScheduledTaskRun,
            ScheduledTaskRunStatus,
        )

        status_map = {
            "completed": ScheduledTaskRunStatus.COMPLETED,
            "failed": ScheduledTaskRunStatus.FAILED,
            "skipped": ScheduledTaskRunStatus.SKIPPED,
        }
        run_status = status_map.get(status, ScheduledTaskRunStatus.FAILED)

        async with async_session_maker() as hook_session:
            run_result = await hook_session.execute(
                sa_select(ScheduledTaskRun).where(ScheduledTaskRun.id == run_id)
            )
            run = run_result.scalar_one_or_none()
            if not run:
                return

            now = utcnow()
            run.status = run_status
            run.execution_id = execution_id
            run.completed_at = now
            run.error_message = error_message

            if status == "completed":
                output = (complete_event or {}).get("output", {})
                summary = ""
                if isinstance(output, dict):
                    summary = output.get("response", "")
                run.result_summary = summary[:2000]

            if run.created_at:
                run.duration_seconds = (now - run.created_at).total_seconds()

            await hook_session.commit()

            if status == "completed":
                await _run_scheduled_task_post_hooks(hook_session, task_id, run)

    except Exception:
        logger.exception(
            "Failed to update scheduled task run for execution %s",
            execution_id,
        )


async def _run_scheduled_task_post_hooks(
    session: AsyncSession,
    task_id: str,
    run: Any,
) -> None:
    """Run post-action hooks (webhooks, GitHub comments, etc.)."""
    from sqlalchemy import select as sa_select

    from src.infra.database import async_session_maker
    from src.scheduled_tasks.hooks import run_post_actions
    from src.scheduled_tasks.models import ScheduledTask
    from src.scheduled_tasks.schemas import ScheduledTaskConfig

    async with async_session_maker() as hook_session:
        task_result = await hook_session.execute(
            sa_select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        task = task_result.scalar_one_or_none()
        if not task:
            return

        config = ScheduledTaskConfig(
            id=task.id,
            name=task.name,
            description=task.description,
            enabled=task.enabled,
            schedule_type=task.schedule_type,
            target_type=task.target_type,
            target_id=task.target_id,
            input_text=task.input_text,
            config=task.config or {},
            version=task.version,
            tags=task.tags or [],
        )

        execution_result = {
            "summary": run.result_summary or "",
            "content": run.result_summary or "",
        }
        await run_post_actions(config, run, execution_result)


# --- Persist assistant message after execution ---


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


# --- Document tasks (stream: tasks:documents) ---


async def document_process_handler(data: dict[str, Any]) -> None:
    """Process an uploaded document into chunks and embeddings.

    Receives data from tasks:documents stream:
    - collection_id: str
    - document_id: str
    - object_key: str  (S3 key in MinIO)
    - filename: str
    - chunk_size: int
    - chunk_overlap: int
    """
    from sqlalchemy import update

    from src.infra.database import async_session_maker
    from src.rag.models import DocumentStatus, RAGDocument
    from src.rag.processor import process_document

    collection_id = data.get("collection_id", "")
    document_id = data.get("document_id", "")
    object_key = data.get("object_key", "")
    filename = data.get("filename", "")
    chunk_size = int(data.get("chunk_size", 500))
    chunk_overlap = int(data.get("chunk_overlap", 50))

    if not all([collection_id, document_id, object_key, filename]):
        logger.error("document_process_handler: missing required fields in %s", data)
        return

    logger.info("Processing document %s (%s)", filename, document_id)

    async with async_session_maker() as session:
        try:
            from src.infra.config import get_settings
            from src.infra.object_store import get_object_store

            store = get_object_store()
            s = get_settings()
            file_content = await store.download(s.S3_BUCKET_RAG, object_key)

            chunk_count = await process_document(
                document_id=document_id,
                collection_id=collection_id,
                file_content=file_content,
                filename=filename,
                db_session=session,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

            await session.execute(
                update(RAGDocument)
                .where(RAGDocument.id == document_id)
                .values(status=DocumentStatus.READY.value)
            )
            await session.commit()
            logger.info("Document %s processed: %d chunks", document_id, chunk_count)

            # File stays in MinIO — no deletion (persistent storage)

        except Exception as exc:  # noqa: BLE001 — Worker resilience: catch all to avoid stream consumer crash
            logger.exception("Failed to process document %s", document_id)
            try:
                await session.execute(
                    update(RAGDocument)
                    .where(RAGDocument.id == document_id)
                    .values(
                        status=DocumentStatus.FAILED.value,
                        error_message=str(exc)[:500],
                    )
                )
                await session.commit()
            except (OSError, sqlalchemy.exc.SQLAlchemyError):
                logger.exception("Failed to update document %s status to FAILED", document_id)
            raise  # Re-raise to trigger retry/DLQ


# --- Model tasks (stream: tasks:models) ---


async def model_pull_handler(data: dict[str, Any]) -> None:
    """Pull an Ollama model, reporting progress via Redis.

    Receives data from tasks:models stream:
    - model_name: str
    """
    import httpx

    from src.infra.config import settings
    from src.infra.redis import get_redis_client

    model_name = data.get("model_name", "")
    if not model_name:
        logger.error("model_pull_handler: missing model_name")
        return

    logger.info("Pulling model: %s", model_name)
    progress_key = f"runtime:model_pull_progress:{model_name}"

    r = await get_redis_client()

    try:
        await r.hset(progress_key, mapping={"status": "downloading", "progress": "0"})
        max_pct = 0

        async with (
            httpx.AsyncClient(base_url=settings.OLLAMA_BASE_URL, timeout=None) as client,
            client.stream("POST", "/api/pull", json={"name": model_name, "stream": True}) as resp,
        ):
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                total = chunk.get("total", 0)
                completed = chunk.get("completed", 0)
                pct = int((completed / total * 100) if total else 0)

                # Never let progress go backwards
                max_pct = max(max_pct, pct)

                await r.hset(
                    progress_key,
                    mapping={
                        "status": "downloading",
                        "progress": str(max_pct),
                    },
                )

                # Check for cancellation
                cancel_key = f"runtime:model_pull_cancel:{model_name}"
                if await r.exists(cancel_key):
                    logger.info("Model pull cancelled: %s", model_name)
                    await r.hset(progress_key, mapping={"status": "cancelled", "progress": "0"})
                    return

        await r.hset(progress_key, mapping={"status": "completed", "progress": "100"})
        # Expire progress key after 1 hour
        await r.expire(progress_key, 3600)
        logger.info("Model %s pulled successfully", model_name)

    except (httpx.HTTPError, ConnectionError, OSError, TimeoutError) as exc:
        logger.exception("Failed to pull model %s", model_name)
        await r.hset(
            progress_key,
            mapping={"status": "error", "progress": "0", "error": str(exc)[:500]},
        )
        raise  # Trigger retry/DLQ
    finally:
        await r.aclose()
