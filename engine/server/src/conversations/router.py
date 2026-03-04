"""
Conversation router.

API endpoints for conversation management and message sending.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from src.auth import CurrentUser
from src.domain_config import get_config_provider
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.config import get_settings
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .models import Conversation, MessageRole
from .schemas import (
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


async def _maybe_enqueue_marathon_extraction(conversation_id: str) -> None:
    """Check marathon threshold and enqueue extraction if hit (fire-and-forget).

    Uses its own DB session to avoid interfering with the request transaction.
    """
    import json
    from datetime import datetime

    from sqlalchemy import func, select, update

    from src.infra.database import async_session_maker
    from src.infra.metrics import memory_extraction_enqueued
    from src.infra.publish import enqueue_memory_raw

    from .models import Conversation, ConversationMessage

    s = get_settings()
    if not s.FACT_EXTRACTION_ENABLED:
        return

    try:
        async with async_session_maker() as session:
            conv = await session.get(Conversation, conversation_id)
            if not conv:
                return

            cutoff = conv.last_memory_extracted_at or datetime.min

            count_result = await session.execute(
                select(func.count(ConversationMessage.id)).where(
                    ConversationMessage.conversation_id == conversation_id,
                    ConversationMessage.created_at > cutoff,
                )
            )
            new_count = count_result.scalar() or 0

            if new_count < s.MEMORY_EXTRACTION_BATCH_SIZE:
                return
            if new_count < s.FACT_EXTRACTION_MIN_MESSAGES:
                return

            result = await session.execute(
                select(ConversationMessage)
                .where(
                    ConversationMessage.conversation_id == conversation_id,
                    ConversationMessage.created_at > cutoff,
                )
                .order_by(ConversationMessage.created_at)
            )
            messages = list(result.scalars().all())
            if not messages:
                return

            messages_json = json.dumps([
                {"role": m.role.value, "content": m.content}
                for m in messages
            ])

            await enqueue_memory_raw(
                conversation_id=conv.id,
                agent_id=conv.agent_id or "",
                messages=messages_json,
                user_id=conv.user_id,
            )

            latest_msg_time = messages[-1].created_at
            await session.execute(
                update(Conversation)
                .where(Conversation.id == conv.id)
                .values(last_memory_extracted_at=latest_msg_time)
            )
            await session.commit()

            memory_extraction_enqueued.labels(trigger="marathon").inc()
            logger.info(
                "Marathon extraction: enqueued %d messages from conversation %s",
                len(messages), conv.id,
            )
    except Exception:
        logger.debug(
            "Marathon extraction check failed for conversation %s",
            conversation_id,
            exc_info=True,
        )


# ─── Cross-Conversation Search (MUST be before {conversation_id} routes) ──────


@router.post("/search", response_model=ConversationSearchResponse)
async def search_conversations(
    request: ConversationSearchRequest,
    user: CurrentUser,
    db: DbSession,
) -> ConversationSearchResponse:
    """Search across conversations via hybrid search (dense + BM25)."""
    from .search import ConversationSearchService

    allowed_group_user_ids: list[str] = []
    if request.include_group:
        from sqlalchemy import select

        from src.groups.models import UserGroup, UserGroupMember

        # Single query: find all user_ids in groups that (a) current user belongs to
        # and (b) allow cross-conversation search.
        group_members_query = (
            select(UserGroupMember.user_id)
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(
                UserGroup.allow_cross_conversation_search == True,  # noqa: E712
                UserGroup.id.in_(
                    select(UserGroupMember.group_id)
                    .where(UserGroupMember.user_id == user.id)
                ),
            )
        )
        result = await db.execute(group_members_query)
        allowed_group_user_ids = [r[0] for r in result.all()]

    service = ConversationSearchService()
    results = await service.search(
        query=request.query,
        user_id=user.id,
        agent_id=request.agent_id,
        group_search=request.include_group and bool(allowed_group_user_ids),
        allowed_group_user_ids=allowed_group_user_ids,
        limit=request.limit,
        threshold=request.threshold,
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


def build_conversation_response(
    conv: Conversation, msg_count: int, user_email: str | None = None,
) -> ConversationResponse:
    """Build a ConversationResponse."""
    return ConversationResponse(
        id=conv.id,
        agent_id=conv.agent_id,
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
) -> ConversationListResponse:
    """List user's conversations."""
    service = ConversationService(db)
    conversations_with_counts, total = await service.list_conversations(
        user_id=user.id, page=page, page_size=page_size, agent_id=agent_id
    )

    items = [
        build_conversation_response(conv, msg_count)
        for conv, msg_count in conversations_with_counts
    ]

    return ConversationListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConversationResponse:
    """Create a new conversation."""
    # Require at least one of agent_id or supervisor_mode
    if not data.agent_id and not data.supervisor_mode:
        raise HTTPException(
            status_code=400,
            detail="Either agent_id or supervisor_mode is required",
        )

    service = ConversationService(db)
    conversation = await service.create_conversation(
        user_id=user.id,
        agent_id=data.agent_id,
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
    conversation = await service.get_conversation(conversation_id)

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


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a conversation."""
    service = ConversationService(db)
    conversation = await service.get_conversation(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    await service.delete_conversation(conversation_id)
    await db.commit()


async def _handle_supervisor_message(
    conversation_id: str,
    conversation,
    data: SendMessageRequest,
    user_msg_response: MessageResponse,
    user: CurrentUser,
    db: DbSession,
    exec_service: ExecutionService,
) -> SendMessageResponse:
    """Handle message routing via supervisor (multi-agent orchestration)."""
    import json as _json

    from sqlalchemy import select as sa_select

    from src.infra.constants import parse_model_id
    from src.infra.redis import get_redis_client
    from src.llm.provider_factory import LLMProviderFactory
    from src.supervisor import SuperSupervisorService

    from .models import ConversationMessage

    conv_config: dict = getattr(conversation, "config", None) or {}
    model_id = conv_config.get("model_id")
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No model selected — choose a model before sending a message",
        )
    provider_name, _ = parse_model_id(model_id)
    llm_provider = LLMProviderFactory.get_provider(provider_name)

    redis_client = await get_redis_client()
    if not redis_client:
        raise HTTPException(status_code=503, detail="Redis unavailable — supervisor requires Redis")

    supervisor = SuperSupervisorService(
        db, get_config_provider(), llm_provider, redis_client,
    )

    # Get recent messages for context (bounded SQL query)
    recent_rows = (await db.execute(
        sa_select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.desc())
        .limit(MAX_RECENT_MESSAGES)
    )).scalars().all()
    recent_messages = [
        {"role": m.role.value if hasattr(m.role, "value") else m.role, "content": m.content, "meta": m.meta}
        for m in reversed(recent_rows)
    ]

    result = await supervisor.process_message(
        conversation_id=conversation_id,
        content=data.content,
        user_id=user.id,
        messages=recent_messages,
        conv_config=conv_config,
    )

    # Dispatch delegated executions to Redis Streams worker
    exec_id = result.get("execution_id")
    exec_ids = result.get("execution_ids")
    first_exec_id = exec_id or (exec_ids[0] if exec_ids else None)
    tool_response_inline = result.get("tool_response_inline", False)

    _model_override_id = None
    if conv_config.get("model_override") and conv_config.get("model_id"):
        _model_override_id = conv_config["model_id"]

    if first_exec_id and not tool_response_inline:
        from src.executions.scheduler import fair_scheduler

        await db.commit()
        execution = await exec_service.get_execution(first_exec_id)
        if execution:
            acquired = await fair_scheduler.acquire(user.id, execution.id)
            if not acquired:
                await db.rollback()
                raise HTTPException(
                    status_code=429, detail="Too many concurrent executions",
                    headers={"Retry-After": "10"},
                )
            await exec_service.dispatch_execution(execution, ab_model_override=_model_override_id)

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
                        await exec_service.dispatch_execution(sub_exec, ab_model_override=_model_override_id)

    await db.commit()
    asyncio.ensure_future(_maybe_enqueue_marathon_extraction(conversation_id))

    # Resolve delegated agent metadata for frontend
    routing_meta = result.get("routing_metadata", {})
    routing_strategy = routing_meta.get("strategy")
    delegated_to = None
    is_ephemeral = None
    if routing_meta.get("agent_id"):
        _agent = await get_config_provider().get_agent_config(routing_meta["agent_id"])
        if _agent:
            delegated_to = _agent.name
            is_ephemeral = bool(_agent.routing_metadata.get("ephemeral")) if _agent.routing_metadata else False

    ephemeral_agent = result.get("ephemeral_agent")
    memory_entries = result.get("memory_entries", [])

    knowledge_data_response = None
    raw_knowledge = result.get("knowledge_data")
    if raw_knowledge:
        from src.conversations.schemas import KnowledgeDataResponse
        knowledge_data_response = KnowledgeDataResponse(
            collections=raw_knowledge.get("collections", []),
            chunks=raw_knowledge.get("chunks", []),
            total_results=raw_knowledge.get("total_results", 0),
        )

    # Build response based on result type
    base_kwargs = dict(
        user_message=user_msg_response,
        routing_strategy=routing_strategy,
        memory_entries=memory_entries,
    )
    if result.get("direct_response"):
        return SendMessageResponse(
            **base_kwargs,
            execution_id=None,
            message_id=result.get("message_id"),
            stream_url=None,
            direct_response=result["direct_response"],
            knowledge_data=knowledge_data_response,
        )
    elif exec_ids:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_ids[0],
            stream_url=f"/api/v1/executions/{exec_ids[0]}/stream",
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=ephemeral_agent,
        )
    else:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_id,
            stream_url=f"/api/v1/executions/{exec_id}/stream" if exec_id else None,
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=ephemeral_agent,
        )


async def _handle_direct_execution(
    conversation_id: str,
    conversation,
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
        except Exception:
            logger.debug("MCP auto-enable failed, continuing without MCP servers", exc_info=True)

    execution_data = ExecutionCreate(
        prompt=data.content,
        session_id=conversation_id,
        input_data={"mcp_server_ids": _mcp_ids} if _mcp_ids else None,
    )

    if not conversation.agent_id:
        raise ValueError("Conversation has no agent configured")

    execution = await exec_service.start_agent_execution(
        agent_id=conversation.agent_id, data=execution_data, user_id=user.id,
    )
    await db.commit()

    asyncio.ensure_future(_maybe_enqueue_marathon_extraction(conversation_id))

    acquired = await fair_scheduler.acquire(user.id, execution.id)
    if not acquired:
        raise HTTPException(
            status_code=429, detail="Too many concurrent executions. Try again later.",
            headers={"Retry-After": "10"},
        )

    _direct_override = None
    if conv_config.get("model_override") and conv_config.get("model_id"):
        _direct_override = conv_config["model_id"]
    await exec_service.dispatch_execution(execution, ab_model_override=_direct_override)
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
    conversation = await conv_service.get_conversation(conversation_id)

    if not conversation:
        raise_not_found("Conversation")

    check_conversation_access(conversation, user.id)

    # Save user message
    user_msg = await conv_service.add_message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=data.content,
    )

    exec_service = ExecutionService(db)
    try:
        user_msg_response = MessageResponse(
            id=user_msg.id,
            role="user",
            content=user_msg.content,
            metadata=user_msg.meta or {},
            created_at=user_msg.created_at,
        )

        if getattr(conversation, "supervisor_mode", False):
            return await _handle_supervisor_message(
                conversation_id, conversation, data,
                user_msg_response, user, db, exec_service,
            )
        else:
            return await _handle_direct_execution(
                conversation_id, conversation, data,
                user_msg_response, user, db, exec_service,
            )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to create execution: %s", e)
        raise HTTPException(status_code=500, detail="Failed to start execution")


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
        page=page, page_size=page_size, agent_id=agent_id, search=search,
    )

    # Batch-resolve user emails
    user_ids = {conv.user_id for conv, _ in conversations_with_counts}
    email_map: dict[str, str] = {}
    if user_ids:
        result = await db.execute(
            sa_select(User.id, User.email).where(User.id.in_(user_ids))
        )
        email_map = {row[0]: row[1] for row in result.all()}

    items = [
        build_conversation_response(
            conv, msg_count, user_email=email_map.get(conv.user_id),
        )
        for conv, msg_count in conversations_with_counts
    ]

    return ConversationListResponse(
        items=items, total=total, page=page, page_size=page_size,
    )
