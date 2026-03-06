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
from src.pipeline.handlers._common import parse_pipeline_data

logger = logging.getLogger(__name__)

_MIN_CONFIDENCE = 0.3


async def extractor_handler(data: dict[str, Any]) -> None:
    """Extract facts from a conversation and publish to memory:extracted."""
    ctx = parse_pipeline_data(data)
    if not ctx:
        logger.warning("extractor_handler: missing conversation_id, skipping")
        return

    conversation_id = ctx.conversation_id
    agent_id = ctx.agent_id or ""
    user_id = ctx.user_id or ""
    messages = ctx.messages

    settings = get_settings()
    if not settings.FACT_EXTRACTION_ENABLED:
        logger.debug("Fact extraction disabled, skipping conversation %s", conversation_id)
        return

    if not messages:
        logger.debug("extractor_handler: no messages for conversation %s", conversation_id)
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

    from src.infra.metrics import pipeline_facts_extracted
    pipeline_facts_extracted.inc(len(facts))

    logger.info(
        "Published %d facts from conversation %s to memory:extracted",
        len(facts), conversation_id,
    )
