"""Conversation compaction router."""

import logging

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser
from src.domain_config import get_config_provider
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .helpers import check_conversation_access
from .schemas import CompactResponse
from .service import ConversationService

logger = logging.getLogger(__name__)

router = APIRouter()


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
