"""
Conversation router.

API endpoints for conversation management and message sending.
"""

import logging

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from src.auth import CurrentUser
from src.domain_config import get_config_provider
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import Conversation, MessageRole
from .schemas import (
    AttachmentResponse,
    CompactResponse,
    ConversationCreate,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationResponse,
    ConversationSearchRequest,
    ConversationSearchResponse,
    ConversationSearchResultItem,
    ConversationUpdate,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from .service import ConversationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["Conversations"])

MAX_RECENT_MESSAGES = 20
"""Maximum number of recent messages loaded for supervisor context."""


# ─── Cross-Conversation Search (MUST be before {conversation_id} routes) ──────


@router.post("/search", response_model=ConversationSearchResponse)
async def search_conversations(
    request: ConversationSearchRequest,
    user: CurrentUser,
    db: DbSession,
) -> ConversationSearchResponse:
    """Search across conversations via hybrid search (dense + BM25)."""
    from .search import ConversationSearchService

    service = ConversationSearchService(db)
    results = await service.search(
        query=request.query,
        user_id=user.id,
        agent_id=request.agent_id,
        limit=request.limit,
    )

    return ConversationSearchResponse(
        results=[
            ConversationSearchResultItem(
                conversation_id=r.conversation_id,
                conversation_title=r.conversation_title,
                message_content=r.message_content,
                score=r.score,
                timestamp=r.timestamp,
                agent_id=r.agent_id,
            )
            for r in results
        ],
        total=len(results),
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────


def check_conversation_access(conversation: Conversation, user_id: str) -> None:
    """Verify user owns the conversation or raise 403."""
    if conversation.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")


# Document MIME types that can have text extracted
_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MAX_ATTACHMENT_CONTEXT_CHARS = 10000


async def _enrich_prompt_with_attachments(
    content: str,
    attachments: list[dict],
) -> str:
    """Extract text from document attachments and prepend to the user prompt."""
    from src.infra.config import get_settings
    from src.infra.object_store import get_object_store
    from src.rag.processor import extract_text

    settings = get_settings()
    store = get_object_store()

    parts: list[str] = []
    for att in attachments:
        ct = att.get("content_type") or ""
        if ct not in _DOCUMENT_CONTENT_TYPES:
            continue
        try:
            file_bytes = await store.download(
                settings.S3_BUCKET_ATTACHMENTS,
                att["object_key"],
            )
            text = await extract_text(file_bytes, att["filename"])
            if text:
                truncated = text[:_MAX_ATTACHMENT_CONTEXT_CHARS]
                parts.append(
                    f"[Attached document: {att['filename']}]\n"
                    f"<document_content>\n{truncated}\n</document_content>"
                )
        except (OSError, ValueError, RuntimeError):
            logger.warning(
                "Failed to extract text from attachment %s",
                att.get("filename"),
                exc_info=True,
            )

    if not parts:
        return content

    attachment_context = "\n\n".join(parts)
    return f"{attachment_context}\n\n{content}"


def build_conversation_response(
    conv: Conversation,
    msg_count: int,
    user_email: str | None = None,
) -> ConversationResponse:
    """Build a ConversationResponse."""
    return ConversationResponse(
        id=conv.id,
        agent_id=conv.agent_id,
        graph_id=getattr(conv, "graph_id", None),
        user_email=user_email,
        title=conv.title,
        is_active=conv.is_active,
        supervisor_mode=getattr(conv, "supervisor_mode", False),
        config=getattr(conv, "config", None) or {},
        message_count=msg_count,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    user: CurrentUser,
    db: DbSession,
    page: int = 1,
    page_size: int = Query(default=20, ge=1, le=100),
    agent_id: str | None = None,
    project_id: str | None = None,
) -> ConversationListResponse:
    """List user's conversations."""
    service = ConversationService(db)
    conversations_with_counts, total = await service.list_conversations(
        user_id=user.id, page=page, page_size=page_size,
        agent_id=agent_id, project_id=project_id,
    )

    items = [
        build_conversation_response(conv, msg_count)
        for conv, msg_count in conversations_with_counts
    ]

    return ConversationListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConversationResponse:
    """Create a new conversation."""
    # Require agent_id, graph_id, supervisor_mode, or a model_id in config (raw LLM mode)
    has_model = bool((data.config or {}).get("model_id"))
    if not data.agent_id and not data.graph_id and not data.supervisor_mode and not has_model:
        raise HTTPException(
            status_code=400,
            detail="Either agent_id, graph_id, supervisor_mode, or model_id in config is required",
        )

    service = ConversationService(db)
    conversation = await service.create_conversation(
        user_id=user.id,
        agent_id=data.agent_id,
        graph_id=data.graph_id,
        title=data.title,
        supervisor_mode=data.supervisor_mode,
        config=data.config,
    )
    await db.commit()

    return build_conversation_response(conversation, 0)


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ConversationDetailResponse:
    """Get a conversation with its messages."""
    service = ConversationService(db)
    conversation = await service.get_conversation(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    messages = [
        MessageResponse(
            id=msg.id,
            role=msg.role.value if hasattr(msg.role, "value") else msg.role,
            content=msg.content,
            metadata=msg.meta or {},
            attachments=[
                AttachmentResponse(
                    id=a["id"],
                    filename=a["filename"],
                    content_type=a.get("content_type"),
                    size_bytes=a.get("size_bytes"),
                )
                for a in (msg.attachments or [])
            ],
            created_at=msg.created_at,
        )
        for msg in conversation.messages
    ]

    return ConversationDetailResponse(
        id=conversation.id,
        agent_id=conversation.agent_id,
        title=conversation.title,
        is_active=conversation.is_active,
        supervisor_mode=getattr(conversation, "supervisor_mode", False),
        config=getattr(conversation, "config", None) or {},
        message_count=len(messages),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=messages,
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    data: ConversationUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ConversationResponse:
    """Update conversation config and/or supervisor_mode."""
    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    updated = await service.update_conversation(
        conversation_id=conversation_id,
        title=data.title,
        config=data.config,
        supervisor_mode=data.supervisor_mode,
    )
    await db.commit()

    msg_count = await service.get_message_count(conversation_id)
    return build_conversation_response(updated, msg_count)


@router.delete("/{conversation_id}/messages/{message_id}/after", status_code=204)
async def delete_messages_from(
    conversation_id: str,
    message_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a message and all messages after it."""
    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    deleted = await service.delete_messages_from(conversation_id, message_id)
    if deleted == 0:
        raise_not_found("Message")

    await db.commit()


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a conversation."""
    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    await service.delete_conversation(conversation_id)
    await db.commit()


# ─── Attachment Endpoints ────────────────────────────────────────────────────

ATTACHMENT_ALLOWED_TYPES = {
    # Documents
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    # Images
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
}
ATTACHMENT_ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".csv",
    ".md",
    ".json",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
}
ATTACHMENT_MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
ATTACHMENT_REDIS_TTL = 3600  # 1 hour


@router.post("/{conversation_id}/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),  # noqa: B008
) -> AttachmentResponse:
    """Upload a file attachment for a future message in this conversation."""
    import os
    from uuid import uuid4

    from src.infra.config import get_settings
    from src.infra.object_store import get_object_store
    from src.infra.redis import get_redis_client

    settings = get_settings()

    # Verify conversation exists and belongs to user
    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)
    if not conversation:
        raise_not_found("Conversation")
    check_conversation_access(conversation, user.id)

    # Validate file
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ATTACHMENT_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'",
        )

    # Read file (capped at max size)
    chunks: list[bytes] = []
    total_size = 0
    while chunk := await file.read(64 * 1024):
        total_size += len(chunk)
        if total_size > ATTACHMENT_MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {ATTACHMENT_MAX_FILE_SIZE // (1024 * 1024)}MB)",
            )
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    attachment_id = str(uuid4())
    object_key = f"chat/{conversation_id}/{attachment_id}/{filename}"

    # Upload to MinIO
    store = get_object_store()
    await store.upload(
        bucket=settings.S3_BUCKET_ATTACHMENTS,
        key=object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    # Store pending metadata in Redis (TTL = 1 hour)
    import json

    redis = await get_redis_client()
    meta = {
        "id": attachment_id,
        "conversation_id": conversation_id,
        "user_id": user.id,
        "filename": filename,
        "content_type": file.content_type,
        "size_bytes": total_size,
        "object_key": object_key,
    }
    await redis.set(f"attachment:{attachment_id}", json.dumps(meta), ex=ATTACHMENT_REDIS_TTL)
    await redis.aclose()

    return AttachmentResponse(
        id=attachment_id,
        filename=filename,
        content_type=file.content_type,
        size_bytes=total_size,
    )


@router.get("/attachments/{attachment_id}")
async def serve_attachment(
    attachment_id: str,
    user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    """Serve an attachment file from a sent message."""
    import json

    from sqlalchemy import text

    from src.infra.config import get_settings
    from src.infra.object_store import get_object_store

    settings = get_settings()

    # Find the message containing this attachment
    result = await db.execute(
        text(
            "SELECT id, conversation_id, attachments FROM conversation_messages "
            "WHERE attachments @> :pattern::jsonb"
        ),
        {"pattern": json.dumps([{"id": attachment_id}])},
    )
    row = result.first()
    if not row:
        raise_not_found("Attachment")

    conversation_id = row[1]
    attachments_list = row[2] or []

    # Verify user owns the conversation
    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)
    if not conversation:
        raise_not_found("Attachment")
    check_conversation_access(conversation, user.id)

    # Find attachment metadata
    att_meta = None
    for att in attachments_list:
        if att.get("id") == attachment_id:
            att_meta = att
            break
    if not att_meta:
        raise_not_found("Attachment")

    object_key = att_meta.get("object_key")
    if not object_key:
        raise HTTPException(status_code=404, detail="Attachment file not found")

    store = get_object_store()
    content_type = att_meta.get("content_type") or "application/octet-stream"
    safe_filename = att_meta.get("filename", "file").replace('"', '\\"')

    async def stream():
        async for chunk in store.download_stream(settings.S3_BUCKET_ATTACHMENTS, object_key):
            yield chunk

    return StreamingResponse(
        stream(),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
        },
    )


def _get_model_override(conv_config: dict) -> str | None:
    """Return the model override ID if configured, else None."""
    if conv_config.get("model_override") and conv_config.get("model_id"):
        return conv_config["model_id"]
    return None


async def _dispatch_supervisor_executions(
    result: dict,
    user_id: str,
    db: DbSession,
    exec_service: ExecutionService,
    redis_client,
    model_override: str | None,
) -> None:
    """Dispatch delegated executions from supervisor to Redis Streams."""
    import json as _json

    from src.executions.scheduler import fair_scheduler

    exec_id = result.get("execution_id")
    exec_ids = result.get("execution_ids")
    first_exec_id = exec_id or (exec_ids[0] if exec_ids else None)
    tool_response_inline = result.get("tool_response_inline", False)

    if not first_exec_id or tool_response_inline:
        return

    await db.commit()
    execution = await exec_service.get_execution(first_exec_id)
    if not execution:
        return

    acquired = await fair_scheduler.acquire(user_id, execution.id)
    if not acquired:
        await db.rollback()
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent executions",
            headers={"Retry-After": "10"},
        )
    await exec_service.dispatch_execution(
        execution,
        ab_model_override=model_override,
    )

    if result.get("routing_metadata"):
        await redis_client.publish(
            f"execution:{first_exec_id}",
            _json.dumps(result["routing_metadata"]),
        )

    # MULTI_ACTION: dispatch remaining executions
    if exec_ids and len(exec_ids) > 1:
        for eid in exec_ids[1:]:
            sub_exec = await exec_service.get_execution(eid)
            if sub_exec:
                await exec_service.dispatch_execution(
                    sub_exec,
                    ab_model_override=model_override,
                )


async def _build_supervisor_response(
    result: dict,
    user_msg_response: MessageResponse,
) -> SendMessageResponse:
    """Build the SendMessageResponse from supervisor result."""
    from src.conversations.schemas import (
        BudgetLayerInfo,
        BudgetOverview,
        ContextData,
        ContextHistory,
        ContextHistoryBudget,
        ContextHistoryMessage,
    )

    routing_meta = result.get("routing_metadata", {})
    routing_strategy = routing_meta.get("strategy")
    delegated_to = None
    is_ephemeral = None

    if routing_meta.get("agent_id"):
        _agent = await get_config_provider().get_agent_config(
            routing_meta["agent_id"],
        )
        if _agent:
            delegated_to = _agent.name
            is_ephemeral = (
                bool(_agent.routing_metadata.get("ephemeral")) if _agent.routing_metadata else False
            )

    # Build context data for frontend memory panel
    context_data_response = None
    raw_context = result.get("context_data")
    if raw_context:
        raw_history = raw_context.get("history", {})
        raw_budget = raw_history.get("budget")
        raw_bo = raw_context.get("budget_overview")
        context_data_response = ContextData(
            history=ContextHistory(
                budget=ContextHistoryBudget(**raw_budget) if raw_budget else None,
                messages=[ContextHistoryMessage(**m) for m in raw_history.get("messages", [])],
                summary=raw_history.get("summary", ""),
            ),
            user_profile=raw_context.get("user_profile"),
            budget_overview=BudgetOverview(
                context_window=raw_bo["context_window"],
                effective_context=raw_bo["effective_context"],
                max_pct=raw_bo["max_pct"],
                layers={k: BudgetLayerInfo(**v) for k, v in raw_bo["layers"].items()},
            )
            if raw_bo
            else None,
        )

    base_kwargs = dict(
        user_message=user_msg_response,
        routing_strategy=routing_strategy,
        context_data=context_data_response,
    )

    exec_id = result.get("execution_id")
    exec_ids = result.get("execution_ids")

    # Error fallback: some strategy handlers return direct_response on failure
    if result.get("direct_response") and not exec_id and not exec_ids:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=None,
            stream_url=None,
            direct_response=result["direct_response"],
        )

    if exec_ids:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_ids[0],
            stream_url=f"/api/v1/executions/{exec_ids[0]}/stream",
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=result.get("ephemeral_agent"),
        )
    else:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_id,
            stream_url=(f"/api/v1/executions/{exec_id}/stream" if exec_id else None),
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=result.get("ephemeral_agent"),
        )


async def _handle_supervisor_message(
    conversation_id: str,
    conversation: Conversation,
    data: SendMessageRequest,
    user_msg_response: MessageResponse,
    user: CurrentUser,
    db: DbSession,
    exec_service: ExecutionService,
) -> SendMessageResponse:
    """Handle message routing via supervisor (multi-agent orchestration)."""
    from sqlalchemy import select as sa_select

    from src.infra.constants import parse_model_id
    from src.infra.redis import get_redis_client
    from src.llm.provider_factory import LLMProviderFactory
    from src.supervisor import SuperSupervisorService

    from .models import ConversationMessage

    conv_config: dict = getattr(conversation, "config", None) or {}
    # Normalise frontend key names → supervisor key names
    if "enabled_agent_ids" in conv_config and "enabled_agents" not in conv_config:
        conv_config["enabled_agents"] = conv_config["enabled_agent_ids"]
    if "enabled_graph_ids" in conv_config and "enabled_graphs" not in conv_config:
        conv_config["enabled_graphs"] = conv_config["enabled_graph_ids"]
    model_id = conv_config.get("model_id")
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No model selected — choose a model before sending",
        )
    provider_name, _ = parse_model_id(model_id)
    llm_provider = LLMProviderFactory.get_provider(provider_name)

    redis_client = await get_redis_client()
    if not redis_client:
        raise HTTPException(
            status_code=503,
            detail="Redis unavailable — supervisor requires Redis",
        )

    supervisor = SuperSupervisorService(
        db,
        get_config_provider(),
        llm_provider,
        redis_client,
    )

    # Get recent messages for context (bounded SQL query)
    recent_rows = (
        (
            await db.execute(
                sa_select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation_id)
                .order_by(ConversationMessage.created_at.desc())
                .limit(MAX_RECENT_MESSAGES)
            )
        )
        .scalars()
        .all()
    )
    recent_messages = [
        {
            "role": (m.role.value if hasattr(m.role, "value") else m.role),
            "content": m.content,
            "meta": m.meta,
        }
        for m in reversed(recent_rows)
    ]

    result = await supervisor.process_message(
        conversation_id=conversation_id,
        content=data.content,
        user_id=user.id,
        messages=recent_messages,
        conv_config=conv_config,
    )

    model_override = _get_model_override(conv_config)

    await _dispatch_supervisor_executions(
        result,
        user.id,
        db,
        exec_service,
        redis_client,
        model_override,
    )

    await db.commit()

    return await _build_supervisor_response(result, user_msg_response)


async def _handle_direct_execution(
    conversation_id: str,
    conversation: Conversation,
    data: SendMessageRequest,
    user_msg_response: MessageResponse,
    user: CurrentUser,
    db: DbSession,
    exec_service: ExecutionService,
) -> SendMessageResponse:
    """Handle direct agent execution (non-supervisor mode)."""
    from src.executions.scheduler import fair_scheduler

    conv_config: dict = conversation.config or {}
    _mcp_ids = conv_config.get("enabled_mcp_servers", [])
    if not _mcp_ids:
        try:
            settings = get_settings()
            if settings.MCP_AUTO_ENABLE:
                from src.mcp.service import get_mcp_registry

                _mcp_ids = [s.id for s in get_mcp_registry().list_servers() if s.enabled]
        except (RuntimeError, ValueError, KeyError):
            logger.debug(
                "MCP auto-enable failed, continuing without MCP",
                exc_info=True,
            )

    execution_data = ExecutionCreate(
        prompt=data.content,
        session_id=conversation_id,
        input_data={"mcp_server_ids": _mcp_ids} if _mcp_ids else None,
    )

    effective_agent_id = conversation.agent_id
    effective_graph_id = conversation.graph_id
    if not effective_agent_id and not effective_graph_id:
        enabled_agents = conv_config.get("enabled_agent_ids", [])
        enabled_graphs = conv_config.get("enabled_graph_ids", [])
        if enabled_graphs:
            effective_graph_id = enabled_graphs[0]
        elif enabled_agents:
            effective_agent_id = enabled_agents[0]

    if effective_agent_id:
        execution = await exec_service.start_agent_execution(
            agent_id=effective_agent_id,
            data=execution_data,
            user_id=user.id,
        )
    elif effective_graph_id:
        execution = await exec_service.start_graph_execution(
            graph_id=effective_graph_id,
            data=execution_data,
            user_id=user.id,
        )
    else:
        # Raw LLM mode — no agent/graph, use model_id from conversation config
        model_id = conv_config.get("model_id")
        if not model_id:
            raise ValueError("No agent, no graph, and no model_id configured")
        raw_params: dict = {}
        if conv_config.get("system_prompt"):
            raw_params["_raw_system_prompt"] = conv_config["system_prompt"]
        if conv_config.get("temperature") is not None:
            raw_params["_raw_temperature"] = conv_config["temperature"]
        if conv_config.get("max_tokens") is not None:
            raw_params["_raw_max_tokens"] = conv_config["max_tokens"]
        if raw_params:
            existing = execution_data.input_data or {}
            execution_data.input_data = {**existing, **raw_params}
        execution = await exec_service.start_raw_execution(
            model_id=model_id,
            data=execution_data,
            user_id=user.id,
        )
    await db.commit()

    acquired = await fair_scheduler.acquire(user.id, execution.id)
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent executions. Try again later.",
            headers={"Retry-After": "10"},
        )

    model_override = _get_model_override(conv_config)
    await exec_service.dispatch_execution(
        execution,
        ab_model_override=model_override,
    )
    await db.commit()

    return SendMessageResponse(
        user_message=user_msg_response,
        execution_id=execution.id,
        stream_url=f"/api/v1/executions/{execution.id}/stream",
    )


@router.post("/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(
    conversation_id: str,
    data: SendMessageRequest,
    user: CurrentUser,
    db: DbSession,
) -> SendMessageResponse:
    """Send a message and trigger agent execution."""
    conv_service = ConversationService(db)
    conversation = await conv_service.get_conversation_by_id(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    # Claim pending attachments from Redis
    attachments_list: list[dict] = []
    if data.attachment_ids:
        import json as _json

        from src.infra.redis import get_redis_client

        redis = await get_redis_client()
        try:
            for att_id in data.attachment_ids:
                raw = await redis.get(f"attachment:{att_id}")
                if not raw:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Attachment {att_id} not found or expired",
                    )
                att_meta = _json.loads(raw)
                if att_meta.get("conversation_id") != conversation_id:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Attachment {att_id} belongs to another conversation",
                    )
                if att_meta.get("user_id") != user.id:
                    raise HTTPException(status_code=403, detail="Access denied")
                attachments_list.append(
                    {
                        "id": att_meta["id"],
                        "filename": att_meta["filename"],
                        "content_type": att_meta.get("content_type"),
                        "size_bytes": att_meta.get("size_bytes"),
                        "object_key": att_meta["object_key"],
                    }
                )
                # Delete from Redis (claimed)
                await redis.delete(f"attachment:{att_id}")
        finally:
            await redis.aclose()

    # Save user message
    user_msg = await conv_service.add_message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=data.content,
        attachments=attachments_list if attachments_list else None,
    )

    exec_service = ExecutionService(db)
    try:
        user_msg_response = MessageResponse(
            id=user_msg.id,
            role="user",
            content=user_msg.content,
            metadata=user_msg.meta or {},
            attachments=[
                AttachmentResponse(
                    id=a["id"],
                    filename=a["filename"],
                    content_type=a.get("content_type"),
                    size_bytes=a.get("size_bytes"),
                )
                for a in (user_msg.attachments or [])
            ],
            created_at=user_msg.created_at,
        )

        # Enrich prompt with text extracted from document attachments
        if attachments_list:
            enriched_content = await _enrich_prompt_with_attachments(
                data.content,
                attachments_list,
            )
            data = SendMessageRequest(
                content=enriched_content,
                attachment_ids=[],
            )

        if getattr(conversation, "supervisor_mode", False):
            return await _handle_supervisor_message(
                conversation_id,
                conversation,
                data,
                user_msg_response,
                user,
                db,
                exec_service,
            )
        else:
            return await _handle_direct_execution(
                conversation_id,
                conversation,
                data,
                user_msg_response,
                user,
                db,
                exec_service,
            )

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("Message send failed: %s", e)
        raise HTTPException(status_code=400, detail="Message send failed") from e
    except (RuntimeError, OSError, KeyError, TypeError) as e:
        logger.exception("Failed to create execution: %s", e)
        raise HTTPException(status_code=500, detail="Failed to start execution") from e


@router.post("/{conversation_id}/compact", response_model=CompactResponse)
async def compact_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
) -> CompactResponse:
    """Compact older conversation messages into an LLM-generated summary.

    The summary replaces old messages in the LLM context window.
    Original messages are preserved in the database.
    """
    from .compaction import CompactionService

    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)
    if not conversation:
        raise_not_found("Conversation")
    check_conversation_access(conversation, user.id)

    # Resolve model_id from agent config or conversation config
    model_id = (conversation.config or {}).get("model_id")
    if not model_id and conversation.agent_id:
        agent = await get_config_provider().get_agent_config(conversation.agent_id)
        if agent:
            model_id = agent.model_id
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No model configured — cannot compact without an LLM",
        )

    compaction = CompactionService(db)
    try:
        result = await compaction.compact(
            conversation_id,
            model_id=model_id,
            user_id=user.id,
        )
    except ValueError as e:
        logger.warning("Compact failed: %s", e)
        raise HTTPException(status_code=400, detail="Compact failed") from e
    except RuntimeError as e:
        logger.warning("Compact failed: %s", e)
        raise HTTPException(status_code=503, detail="Compact unavailable") from e

    await db.commit()
    return CompactResponse(**result)


# ─── Admin Router (prefix: /api/v1/admin) ───────────────────────────────────

from src.auth.dependencies import RequireAdmin

admin_router = APIRouter(
    prefix="/conversations",
    tags=["Admin — Conversations"],
    dependencies=[RequireAdmin],
)


@admin_router.get("", response_model=ConversationListResponse)
async def admin_list_conversations(
    user: CurrentUser,
    db: DbSession = ...,
    page: int = 1,
    page_size: int = Query(default=20, ge=1, le=100),
    agent_id: str | None = None,
    search: str | None = None,
) -> ConversationListResponse:
    """List ALL conversations (admin moderation view)."""
    from sqlalchemy import select as sa_select

    from src.auth.models import User

    service = ConversationService(db)
    conversations_with_counts, total = await service.list_all_conversations(
        page=page,
        page_size=page_size,
        agent_id=agent_id,
        search=search,
    )

    # Batch-resolve user emails
    user_ids = {conv.user_id for conv, _ in conversations_with_counts}
    email_map: dict[str, str] = {}
    if user_ids:
        result = await db.execute(sa_select(User.id, User.email).where(User.id.in_(user_ids)))
        email_map = {row[0]: row[1] for row in result.all()}

    items = [
        build_conversation_response(
            conv,
            msg_count,
            user_email=email_map.get(conv.user_id),
        )
        for conv, msg_count in conversations_with_counts
    ]

    return ConversationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
