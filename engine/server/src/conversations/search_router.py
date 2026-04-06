"""Cross-conversation search router."""

from fastapi import APIRouter

from src.auth import CurrentUser
from src.infra.database import DbSession

from .schemas import (
    ConversationSearchRequest,
    ConversationSearchResponse,
    ConversationSearchResultItem,
)

router = APIRouter()


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
