"""Message sending router."""

import logging

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser
from src.domain_config import get_config_provider
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.database import DbSession
from src.infra.query_utils import raise_not_found
from src.llm.errors import ExecutionError, ExecutionErrorCode

from .helpers import (
    MAX_RECENT_MESSAGES,
    build_message_response,
    check_conversation_access,
    enrich_prompt_with_attachments,
)
from .models import Conversation, MessageRole
from .schemas import (
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from .service import ConversationService
from .supervisor_dispatch import build_supervisor_response, dispatch_supervisor_executions

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_model_override(conv_config: dict) -> str | None:
    """Return the model override ID if configured, else None."""
    if conv_config.get("model_override") and conv_config.get("model_id"):
        return conv_config["model_id"]
    return None


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

    await dispatch_supervisor_executions(
        result,
        user.id,
        db,
        exec_service,
        redis_client,
        model_override,
    )

    await db.commit()

    return await build_supervisor_response(result, user_msg_response)


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

    execution_data = ExecutionCreate(
        prompt=data.content,
        session_id=conversation_id,
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
                await redis.delete(f"attachment:{att_id}")
        finally:
            await redis.aclose()

    user_msg = await conv_service.add_message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=data.content,
        attachments=attachments_list if attachments_list else None,
    )

    exec_service = ExecutionService(db)
    try:
        user_msg_response = build_message_response(user_msg)

        if attachments_list:
            enriched_content = await enrich_prompt_with_attachments(
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
    except ExecutionError as err:
        _STATUS_MAP: dict[ExecutionErrorCode, int] = {
            ExecutionErrorCode.RATE_LIMITED: 429,
            ExecutionErrorCode.AUTH_FAILED: 401,
            ExecutionErrorCode.PERMISSION_DENIED: 403,
            ExecutionErrorCode.TIMEOUT: 504,
        }
        status = _STATUS_MAP.get(err.code, 502)
        raise HTTPException(status_code=status, detail=err.user_message) from err
    except ValueError as e:
        logger.warning("Message send failed: %s", e)
        raise HTTPException(status_code=400, detail="Message send failed") from e
    except (RuntimeError, OSError, KeyError, TypeError) as e:
        logger.exception("Failed to create execution: %s", e)
        raise HTTPException(status_code=500, detail="Failed to start execution") from e
