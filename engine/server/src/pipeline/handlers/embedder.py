"""Embedder handler — memory:extracted -> Qdrant + PostgreSQL.

Generates embeddings for extracted facts and stores them:
- PostgreSQL: MemoryEntry row (metadata, content, importance)
- Qdrant: dense + sparse vectors (hybrid search)
"""

import json
import logging
from typing import Any

from src.embedding import get_embedding_provider
from src.infra.config import get_settings
from src.infra.database import async_session_maker
from src.memory.models import MemoryScope, MemoryTier
from src.memory.repository import MemoryRepository

logger = logging.getLogger(__name__)


async def embedder_handler(data: dict[str, Any]) -> None:
    """Generate embeddings for extracted facts and store in PG + Qdrant."""
    conversation_id = data.get("conversation_id", "")
    agent_id = data.get("agent_id", "")
    facts_raw = data.get("facts", "[]")

    if not conversation_id:
        logger.warning("embedder_handler: missing conversation_id, skipping")
        return

    try:
        facts = json.loads(facts_raw) if isinstance(facts_raw, str) else facts_raw
    except json.JSONDecodeError:
        logger.error("embedder_handler: invalid JSON in facts for conversation %s", conversation_id)
        return

    if not facts:
        logger.debug("No facts to embed for conversation %s", conversation_id)
        return

    settings = get_settings()
    provider = get_embedding_provider(
        settings.EMBEDDING_PROVIDER,
        model=settings.EMBEDDING_MODEL,
    )

    logger.info("Embedding %d facts from conversation %s", len(facts), conversation_id)

    stored = 0
    async with async_session_maker() as session:
        repo = MemoryRepository(session)

        for fact in facts:
            text = fact.get("text", "")
            if not text:
                continue

            category = fact.get("category", "context")
            importance = float(fact.get("importance", 0.5))
            entities = fact.get("entities", [])

            try:
                embedding = await provider.embed_text(text)
            except Exception:
                logger.exception("Failed to embed fact: %s", text[:80])
                continue

            metadata = {
                "category": category,
                "entities": entities,
                "source_conversation": conversation_id,
                "agent_id": agent_id,
            }

            scope = MemoryScope.AGENT if agent_id else MemoryScope.CROSS_CONVERSATION
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
                )
                stored += 1
            except Exception:
                logger.exception("Failed to store memory entry for fact: %s", text[:80])
                continue

        await session.commit()

    logger.info(
        "Stored %d/%d facts from conversation %s",
        stored, len(facts), conversation_id,
    )
