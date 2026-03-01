"""Extractor handler — memory:raw -> memory:extracted.

Reads raw conversation turns, extracts and scores facts using LLM.
Single LLM call to extract facts AND score importance.
Facts with confidence < 0.3 are dropped silently.
"""

import json
import logging
from typing import Any

from src.infra.config import get_settings
from src.infra.publish import get_event_bus
from src.memory.fact_extractor import FactExtractor

logger = logging.getLogger(__name__)

_MIN_CONFIDENCE = 0.3


async def extractor_handler(data: dict[str, Any]) -> None:
    """Extract facts from a conversation and publish to memory:extracted."""
    conversation_id = data.get("conversation_id", "")
    agent_id = data.get("agent_id", "")
    user_id = data.get("user_id", "")
    messages_raw = data.get("messages", "[]")

    if not conversation_id:
        logger.warning("extractor_handler: missing conversation_id, skipping")
        return

    settings = get_settings()
    if not settings.FACT_EXTRACTION_ENABLED:
        logger.debug("Fact extraction disabled, skipping conversation %s", conversation_id)
        return

    try:
        messages = json.loads(messages_raw) if isinstance(messages_raw, str) else messages_raw
    except json.JSONDecodeError:
        logger.error("extractor_handler: invalid JSON in messages for conversation %s", conversation_id)
        return

    if len(messages) < settings.FACT_EXTRACTION_MIN_MESSAGES:
        logger.debug(
            "Conversation %s has %d messages (min %d), skipping extraction",
            conversation_id, len(messages), settings.FACT_EXTRACTION_MIN_MESSAGES,
        )
        return

    logger.info("Extracting facts from conversation %s (%d messages)", conversation_id, len(messages))

    extractor = FactExtractor()
    facts = await extractor.extract_facts(messages, user_id=user_id, agent_id=agent_id)

    # Filter out low-confidence facts
    facts = [f for f in facts if f.confidence >= _MIN_CONFIDENCE]

    if not facts:
        logger.info("No high-confidence facts extracted from conversation %s", conversation_id)
        return

    # Publish to memory:extracted stream
    bus = await get_event_bus()
    payload = {
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "user_id": user_id,
        "facts": json.dumps([
            {
                "text": f.content,
                "category": f.category.value,
                "importance": f.confidence,
                "entities": f.entities,
            }
            for f in facts
        ]),
    }
    await bus.publish("memory:extracted", payload)
    logger.info(
        "Published %d facts from conversation %s to memory:extracted",
        len(facts), conversation_id,
    )
