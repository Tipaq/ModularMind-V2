"""Task definitions — async functions consumed from Redis Streams.

Each function is an EventBus handler callback: it receives event data dict
and returns when done (or raises to trigger retry/DLQ).
"""

import json
import logging
from typing import Any

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
    if not execution_id:
        logger.error("graph_execution_handler: missing execution_id")
        return

    logger.info("Starting execution %s", execution_id)

    async with async_session_maker() as session:
        service = ExecutionService(session)

        complete_event: dict[str, Any] | None = None

        try:
            from src.infra.redis import get_redis_client

            r = get_redis_client()
            try:
                channel = f"execution:{execution_id}"
                async for event in service.execute(execution_id):
                    # Publish events to Redis pub/sub for SSE relay
                    await r.publish(channel, json.dumps(event, default=str))

                    if event.get("type") == "complete":
                        complete_event = event
                        break
            finally:
                await r.aclose()

            # Persist assistant message to conversation
            await _persist_assistant_message(session, execution_id, complete_event)

            await session.commit()
            logger.info("Execution %s completed", execution_id)

        except Exception:
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
            raise  # Re-raise to trigger retry/DLQ

        finally:
            # Release the fair-scheduler slot so the global/team counters stay accurate.
            # This runs whether the execution succeeded, failed, or was cancelled.
            if user_id and execution_id:
                try:
                    await fair_scheduler.release(user_id, execution_id)
                except Exception as exc:
                    logger.warning(
                        "Failed to release scheduler slot for execution %s: %s",
                        execution_id, exc,
                    )


# --- Persist assistant message after execution ---


async def _persist_assistant_message(
    session: "AsyncSession",
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

    result = await session.execute(
        select(ExecutionRun).where(ExecutionRun.id == execution_id)
    )
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
        execution_id, execution.session_id,
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

        except Exception as exc:
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
            except Exception:
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

    r = get_redis_client()

    try:
        await r.hset(progress_key, mapping={"status": "downloading", "progress": "0"})
        max_pct = 0

        async with httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=None
        ) as client, client.stream(
            "POST", "/api/pull", json={"name": model_name, "stream": True}
        ) as resp:
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

                await r.hset(progress_key, mapping={
                    "status": "downloading",
                    "progress": str(max_pct),
                })

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

    except Exception:
        logger.exception("Failed to pull model %s", model_name)
        await r.hset(progress_key, mapping={"status": "error", "progress": "0"})
        raise  # Trigger retry/DLQ
    finally:
        await r.aclose()
