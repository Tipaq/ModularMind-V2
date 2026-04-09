import logging

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, func, select

from src.auth import CurrentUser
from src.conversations.models import Conversation, ConversationMessage
from src.executions.models import ExecutionRun, ExecutionStatus
from src.infra.database import DbSession
from src.infra.token_pricing import estimate_cost

from .schemas import (
    AdminConversationItem,
    AdminConversationListResponse,
    AdminConversationMessagesResponse,
    AdminMessageResponse,
    DeleteCountResponse,
)
from .service import get_user_or_404

logger = logging.getLogger(__name__)

admin_user_conversations_router = APIRouter(tags=["Admin — Users"])


@admin_user_conversations_router.get(
    "/{user_id}/conversations", response_model=AdminConversationListResponse
)
async def list_user_conversations(
    user_id: str,
    user: CurrentUser,
    db: DbSession,
    agent_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> AdminConversationListResponse:
    await get_user_or_404(db, user_id)

    base = select(Conversation).where(Conversation.user_id == user_id)
    if agent_id:
        base = base.where(Conversation.agent_id == agent_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    offset = (page - 1) * page_size
    convs_result = await db.execute(
        base.order_by(Conversation.updated_at.desc()).offset(offset).limit(page_size)
    )
    convs = convs_result.scalars().all()

    conv_ids = [c.id for c in convs]

    msg_count_map: dict[str, int] = {}
    token_map: dict[str, tuple[int, int]] = {}
    conv_cost_map: dict[str, float] = {}

    if conv_ids:
        msg_result = await db.execute(
            select(
                ConversationMessage.conversation_id,
                func.count(),
            )
            .where(ConversationMessage.conversation_id.in_(conv_ids))
            .group_by(ConversationMessage.conversation_id)
        )
        msg_count_map = dict(msg_result.all())

        token_result = await db.execute(
            select(
                ExecutionRun.session_id,
                func.coalesce(func.sum(ExecutionRun.tokens_prompt), 0),
                func.coalesce(func.sum(ExecutionRun.tokens_completion), 0),
            )
            .where(
                ExecutionRun.session_id.in_(conv_ids),
                ExecutionRun.status == ExecutionStatus.COMPLETED,
            )
            .group_by(ExecutionRun.session_id)
        )
        token_map = {row[0]: (row[1], row[2]) for row in token_result}

        cost_result = await db.execute(
            select(
                ExecutionRun.session_id,
                ExecutionRun.model,
                func.sum(ExecutionRun.tokens_prompt),
                func.sum(ExecutionRun.tokens_completion),
            )
            .where(
                ExecutionRun.session_id.in_(conv_ids),
                ExecutionRun.status == ExecutionStatus.COMPLETED,
                ExecutionRun.model.isnot(None),
            )
            .group_by(ExecutionRun.session_id, ExecutionRun.model)
        )
        for sid, model_id, prompt_tokens, completion_tokens in cost_result:
            cost = estimate_cost(model_id, prompt_tokens, completion_tokens)
            if cost is not None:
                conv_cost_map[sid] = conv_cost_map.get(sid, 0.0) + cost

    items = []
    for c in convs:
        tp, tc = token_map.get(c.id, (0, 0))
        items.append(
            AdminConversationItem(
                id=c.id,
                agent_id=c.agent_id,
                title=c.title,
                message_count=msg_count_map.get(c.id, 0),
                tokens_prompt=tp,
                tokens_completion=tc,
                estimated_cost=conv_cost_map.get(c.id),
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
        )

    return AdminConversationListResponse(items=items, total=total, page=page, page_size=page_size)


@admin_user_conversations_router.get(
    "/{user_id}/conversations/{conversation_id}/messages",
    response_model=AdminConversationMessagesResponse,
)
async def get_conversation_messages(
    user_id: str,
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> AdminConversationMessagesResponse:
    target = await get_user_or_404(db, user_id)

    conv = (
        await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    total = (
        await db.execute(
            select(func.count()).where(ConversationMessage.conversation_id == conversation_id)
        )
    ).scalar() or 0

    offset = (page - 1) * page_size
    messages = (
        (
            await db.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation_id)
                .order_by(ConversationMessage.created_at)
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return AdminConversationMessagesResponse(
        conversation_id=conversation_id,
        user_id=user_id,
        user_email=target.email,
        total=total,
        page=page,
        page_size=page_size,
        messages=[
            AdminMessageResponse(
                id=m.id,
                role=m.role.value,
                content=m.content,
                metadata=m.meta,
                execution_id=m.execution_id,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


@admin_user_conversations_router.delete(
    "/{user_id}/conversations", response_model=DeleteCountResponse
)
async def delete_user_conversations(
    user_id: str,
    user: CurrentUser,
    db: DbSession,
) -> DeleteCountResponse:
    from sqlalchemy import update

    await get_user_or_404(db, user_id)

    count = (
        await db.execute(select(func.count()).where(Conversation.user_id == user_id))
    ).scalar() or 0

    if count > 0:
        conv_ids = (
            (await db.execute(select(Conversation.id).where(Conversation.user_id == user_id)))
            .scalars()
            .all()
        )

        if conv_ids:
            await db.execute(
                update(ExecutionRun)
                .where(ExecutionRun.session_id.in_(conv_ids))
                .values(session_id=None)
            )

        await db.execute(delete(Conversation).where(Conversation.user_id == user_id))
        await db.commit()

    logger.info("Admin %s deleted %d conversations for user %s", user.email, count, user_id)
    return DeleteCountResponse(deleted_count=count)
