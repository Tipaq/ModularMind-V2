"""Shared helpers for conversation sub-routers."""

import logging

from fastapi import HTTPException

from .models import Conversation
from .schemas import (
    AttachmentResponse,
    ConversationResponse,
    MessageResponse,
)

logger = logging.getLogger(__name__)

MAX_RECENT_MESSAGES = 20
"""Maximum number of recent messages loaded for supervisor context."""

_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MAX_ATTACHMENT_CONTEXT_CHARS = 10000


def check_conversation_access(conversation: Conversation, user_id: str) -> None:
    """Verify user owns the conversation or raise 403."""
    if conversation.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")


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


def build_message_response(msg) -> MessageResponse:
    """Build a MessageResponse from a ConversationMessage."""
    return MessageResponse(
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


async def enrich_prompt_with_attachments(
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
