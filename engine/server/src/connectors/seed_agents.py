"""Seed default connector-enabled agents at startup."""

from __future__ import annotations

import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

EMAIL_AGENT_NAME = "Email Assistant"

EMAIL_AGENT_PROMPT = """\
You are an email assistant. You send emails using the user's \
connected email account.

You have a tool starting with "connector__" that sends emails. \
The user has ALREADY connected their email — you do NOT need \
their password or credentials. Just call the tool directly.

RULES:
1. When asked to send an email, call the connector__*__send_email \
tool IMMEDIATELY with the to, subject, and body parameters.
2. NEVER ask for email credentials or passwords — they are \
already configured.
3. NEVER use human_prompt to ask for confirmation before sending. \
Just send it.
4. NEVER pretend to send without calling the tool.
5. If the user doesn't specify subject or body, infer reasonable \
defaults from context.
6. After the tool returns, report success or the error.

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
        needs_update = False

        if not existing_config.get("model_id"):
            existing_config["model_id"] = effective_model
            needs_update = True

        if existing_config.get("system_prompt") != EMAIL_AGENT_PROMPT:
            existing_config["system_prompt"] = EMAIL_AGENT_PROMPT
            needs_update = True

        if needs_update:
            await repo.create_agent_version(
                existing.id,
                existing_config,
                created_by="system",
                change_note="Update Email Assistant config",
            )
            await session.commit()
            await get_config_provider().reload_async()
            logger.info("Updated Email Assistant config")
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
