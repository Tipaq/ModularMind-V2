"""Admin router for conversations."""

from fastapi import APIRouter, Query

from src.auth import CurrentUser
from src.auth.dependencies import RequireAdmin
from src.infra.database import DbSession

from .helpers import build_conversation_response
from .schemas import ConversationListResponse
from .service import ConversationService

admin_router = APIRouter(
    prefix="/conversations",
    tags=["Admin — Conversations"],
    dependencies=[RequireAdmin],
)


@admin_router.get("/", response_model=ConversationListResponse)
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
