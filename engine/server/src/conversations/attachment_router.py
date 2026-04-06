"""Attachment upload and serving router."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from src.auth import CurrentUser
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found

from .helpers import check_conversation_access
from .schemas import AttachmentResponse
from .service import ConversationService

logger = logging.getLogger(__name__)

router = APIRouter()

ATTACHMENT_ALLOWED_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    import json
    import os
    from uuid import uuid4

    from src.infra.config import get_settings
    from src.infra.object_store import get_object_store
    from src.infra.redis import get_redis_client

    settings = get_settings()

    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)
    if not conversation:
        raise_not_found("Conversation")
    check_conversation_access(conversation, user.id)

    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ATTACHMENT_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'",
        )

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

    store = get_object_store()
    await store.upload(
        bucket=settings.S3_BUCKET_ATTACHMENTS,
        key=object_key,
        data=file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

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

    service = ConversationService(db)
    conversation = await service.get_conversation_by_id(conversation_id)
    if not conversation:
        raise_not_found("Attachment")
    check_conversation_access(conversation, user.id)

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
