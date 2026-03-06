"""Embedder handler — memory:scored (or memory:extracted) -> Qdrant + PostgreSQL.

Generates embeddings for extracted facts and stores them:
- PostgreSQL: MemoryEntry row (metadata, content, importance)
- Qdrant: dense + sparse vectors (hybrid search)

Accepts input from either memory:scored (when scorer is enabled)
or memory:extracted (when scorer is bypassed).
"""

import logging
from typing import Any

import sqlalchemy.exc

from src.embedding.resolver import get_memory_embedding_provider
from src.infra.database import async_session_maker
from src.memory.models import MemoryScope, MemoryTier, MemoryType
from src.memory.repository import MemoryRepository
from src.pipeline.handlers._common import parse_pipeline_data

logger = logging.getLogger(__name__)


async def embedder_handler(data: dict[str, Any]) -> None:
    """Generate embeddings for extracted facts and store in PG + Qdrant."""
    ctx = parse_pipeline_data(data)
    if not ctx:
        logger.warning("embedder_handler: missing conversation_id, skipping")
        return

    conversation_id = ctx.conversation_id
    agent_id = ctx.agent_id or ""
    user_id = ctx.user_id or ""
    facts = ctx.facts

    if not facts:
        logger.debug("No facts to embed for conversation %s", conversation_id)
        return

    provider = get_memory_embedding_provider()

    logger.info(
        "Embedding %d facts from conversation %s", len(facts), conversation_id
    )

    stored = 0
    async with async_session_maker() as session:
        repo = MemoryRepository(session)

        for fact in facts:
            text = fact.get("text", "")
            if not text:
                continue

            category = fact.get("category", "context")
            # Use scored_importance if present (from scorer), fallback to raw
            importance = float(
                fact.get("scored_importance", fact.get("importance", 0.5))
            )
            entities = fact.get("entities", [])
            # Use memory_type if present (from scorer), default to EPISODIC
            memory_type_str = fact.get("memory_type", "episodic")
            try:
                memory_type = MemoryType(memory_type_str)
            except ValueError:
                memory_type = MemoryType.EPISODIC

            try:
                embedding = await provider.embed_text(text)
            except Exception:  # LLM providers raise heterogeneous errors
                logger.exception("Failed to embed fact: %s", text[:80])
                continue

            metadata = {
                "category": category,
                "entities": entities,
                "source_conversation": conversation_id,
                "agent_id": agent_id,
            }

            scope = (
                MemoryScope.AGENT if agent_id else MemoryScope.CROSS_CONVERSATION
            )
            scope_id = agent_id or "global"

            try:
                await repo.create_entry(
                    scope=scope,
                    scope_id=scope_id,
                    content=text,
                    embedding=embedding,
                    tier=MemoryTier.VECTOR,
                    metadata=metadata,
                    importance=importance,
                    user_id=user_id or None,
                    memory_type=memory_type,
                )
                stored += 1
            except sqlalchemy.exc.SQLAlchemyError:
                logger.exception(
                    "Failed to store memory entry for fact: %s", text[:80]
                )
                continue

        await session.commit()

    if stored > 0:
        from src.infra.metrics import pipeline_embeddings_stored
        pipeline_embeddings_stored.inc(stored)

    logger.info(
        "Stored %d/%d facts from conversation %s",
        stored,
        len(facts),
        conversation_id,
    )
