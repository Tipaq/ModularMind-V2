"""Summarizer handler — memory:raw -> conversation SUMMARY entries.

Runs in parallel with the extractor (own consumer group `summarizers`).
Generates a concise summary of conversation messages via LLM, stores it
as a MemoryEntry with tier=SUMMARY and scope=CONVERSATION.  Previous
summaries for the same conversation are expired before the new one is
created (only one active summary per conversation).
"""

import json
import logging
from typing import Any

import sqlalchemy.exc

from src.infra.config import get_settings

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = """Summarize the following conversation in 2-3 concise sentences.
Focus on the key topics discussed, decisions made, and any important context.
Write the summary as a neutral third-person observer.

Conversation:
{messages}

Summary:"""


async def summarizer_handler(data: dict[str, Any]) -> None:
    """Generate a conversation summary and store as a SUMMARY-tier memory entry."""
    conversation_id = data.get("conversation_id", "")
    agent_id = data.get("agent_id", "")
    user_id = data.get("user_id", "")
    messages_raw = data.get("messages", "[]")

    if not conversation_id:
        logger.warning("summarizer_handler: missing conversation_id, skipping")
        return

    settings = get_settings()
    if not settings.FACT_EXTRACTION_ENABLED:
        logger.debug("Fact extraction disabled, skipping summarizer for %s", conversation_id)
        return

    try:
        messages = json.loads(messages_raw) if isinstance(messages_raw, str) else messages_raw
    except json.JSONDecodeError:
        logger.error("summarizer_handler: invalid JSON for conversation %s", conversation_id)
        return

    if len(messages) < settings.FACT_EXTRACTION_MIN_MESSAGES:
        logger.debug(
            "Conversation %s has %d messages (min %d), skipping summary",
            conversation_id, len(messages), settings.FACT_EXTRACTION_MIN_MESSAGES,
        )
        return

    # Format messages for the LLM prompt
    formatted = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content.strip():
            formatted.append(f"{role}: {content}")

    if not formatted:
        return

    conversation_text = "\n".join(formatted[-50:])  # Cap at 50 messages
    prompt = _SUMMARY_PROMPT.format(messages=conversation_text)

    # Call LLM to generate summary
    try:
        from src.infra.constants import parse_model_id
        from src.llm.provider_factory import LLMProviderFactory

        model_id = settings.FACT_EXTRACTION_MODEL
        if not model_id:
            provider_name = settings.DEFAULT_LLM_PROVIDER
            provider = LLMProviderFactory.get_provider(provider_name)
            if provider:
                available = await provider.list_models()
                chat_models = [
                    m for m in available
                    if "embed" not in m.id.lower() and "minilm" not in m.id.lower()
                ]
                if chat_models:
                    model_id = f"{provider_name}:{chat_models[0].id}"
            if not model_id:
                logger.warning("No chat model available for summarization")
                return

        provider_name, model_name = parse_model_id(model_id)
        provider = LLMProviderFactory.get_provider(provider_name)
        if not provider:
            logger.warning("No LLM provider available for summarization")
            return

        llm = await provider.get_model(model_name, temperature=0.1)

        from langchain_core.messages import HumanMessage
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        summary_text = response.content.strip()

        if not summary_text:
            logger.info("Empty summary for conversation %s", conversation_id)
            return

    except Exception as e:  # LLM providers raise heterogeneous errors
        logger.warning("LLM summarization failed for conversation %s: %s", conversation_id, e)
        return

    # Store the summary as a SUMMARY-tier memory entry
    try:
        from sqlalchemy import select, update

        from src.embedding.resolver import get_memory_embedding_provider
        from src.infra.database import async_session_maker
        from src.memory.models import MemoryEntry, MemoryScope, MemoryTier, MemoryType
        from src.memory.repository import MemoryRepository

        embedding_provider = get_memory_embedding_provider()
        embedding = None
        if embedding_provider:
            try:
                embedding = await embedding_provider.embed_query(summary_text)
            except Exception as e:  # LLM providers raise heterogeneous errors
                logger.warning("Embedding failed for summary: %s", e)

        async with async_session_maker() as session:
            # Expire previous summaries for this conversation
            prev_summaries = await session.execute(
                select(MemoryEntry).where(
                    MemoryEntry.scope == MemoryScope.CONVERSATION,
                    MemoryEntry.scope_id == conversation_id,
                    MemoryEntry.tier == MemoryTier.SUMMARY,
                    MemoryEntry.expired_at.is_(None),
                )
            )
            from src.infra.utils import utcnow

            now = utcnow()
            for old_summary in prev_summaries.scalars().all():
                old_summary.expired_at = now

            # Create new summary entry
            repo = MemoryRepository(session)
            await repo.create_entry(
                scope=MemoryScope.CONVERSATION,
                scope_id=conversation_id,
                content=summary_text,
                embedding=embedding,
                tier=MemoryTier.SUMMARY,
                metadata={
                    "agent_id": agent_id,
                    "message_count": len(messages),
                    "source": "auto_summary",
                },
                user_id=user_id or None,
                importance=0.7,
                memory_type=MemoryType.EPISODIC,
            )

            await session.commit()

        from src.infra.metrics import pipeline_summaries_stored
        pipeline_summaries_stored.inc()

        logger.info(
            "Stored conversation summary for %s (%d messages, %d chars)",
            conversation_id, len(messages), len(summary_text),
        )

    except sqlalchemy.exc.SQLAlchemyError as e:
        logger.error("Failed to store summary for conversation %s: %s", conversation_id, e)
