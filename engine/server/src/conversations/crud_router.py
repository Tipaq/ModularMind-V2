"""CRUD router for conversations."""

from fastapi import APIRouter, HTTPException, Query

from src.auth import CurrentUser
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .helpers import build_conversation_response, build_message_response, check_conversation_access
from .schemas import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationResponse,
    ConversationUpdate,
)
from .service import ConversationService

router = APIRouter()


@router.get("/", response_model=ConversationListResponse)
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


@router.post("/", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    user: CurrentUser,
    db: DbSession,
) -> ConversationResponse:
    """Create a new conversation."""
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
        project_id=data.project_id,
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

    messages = [build_message_response(msg) for msg in conversation.messages]

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
