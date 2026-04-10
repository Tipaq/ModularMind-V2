"""Seed default connector-enabled agents at startup."""

from __future__ import annotations

import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

EMAIL_AGENT_NAME = "Email Assistant"

EMAIL_AGENT_PROMPT = """\
You are an email assistant. You help users send emails using their \
connected email account.

You have access to a connector tool named \
connector__google_email__send_email (or similar) that can send \
emails on behalf of the user.

IMPORTANT RULES:
- When the user asks you to send an email, you MUST call the \
send_email tool. Never pretend to send an email without calling \
the tool.
- Extract the recipient (to), subject, and body from the user's \
message.
- If the user doesn't specify a subject or body, ask them.
- After calling the tool, report the result to the user.
- If the tool returns an error, explain the error clearly.
- You can also help draft emails before sending.

You speak the same language as the user."""


FALLBACK_MODEL_ID = "ollama:qwen3:8b"


async def seed_connector_agents(
    session: AsyncSession, model_id: str
) -> None:
    """Create default connector-enabled agents if they don't exist."""
    from src.domain_config import get_config_provider
    from src.domain_config.repository import ConfigRepository
    from src.infra.constants import DEFAULT_TOOL_CATEGORIES

    effective_model = model_id or FALLBACK_MODEL_ID
    repo = ConfigRepository(session)

    existing = await repo.find_active_agent_by_name(EMAIL_AGENT_NAME)
    if existing:
        existing_config = existing.config or {}
        if not existing_config.get("model_id"):
            existing_config["model_id"] = effective_model
            await repo.create_agent_version(
                existing.id,
                existing_config,
                created_by="system",
                change_note="Fix empty model_id",
            )
            await session.commit()
            await get_config_provider().reload_async()
            logger.info(
                "Fixed Email Assistant model_id: %s",
                effective_model,
            )
        return

    agent_id = str(uuid4())
    tool_cats = {**DEFAULT_TOOL_CATEGORIES}

    config = {
        "id": agent_id,
        "name": EMAIL_AGENT_NAME,
        "description": (
            "Send emails using your connected email account. "
            "Connect your email in Settings > Connections first."
        ),
        "model_id": effective_model,
        "system_prompt": EMAIL_AGENT_PROMPT,
        "memory_enabled": False,
        "timeout_seconds": 120,
        "rag_config": {
            "enabled": False,
            "collection_ids": [],
            "retrieval_count": 5,
            "similarity_threshold": 0.5,
        },
        "tool_categories": tool_cats,
        "capabilities": ["email", "communication"],
        "routing_metadata": {"connector_agent": True},
    }

    await repo.create_agent_version(
        agent_id,
        config,
        created_by="system",
        change_note="Email Assistant seed",
    )
    await session.commit()
    await get_config_provider().reload_async()
    logger.info("Seeded Email Assistant agent: %s", agent_id)
