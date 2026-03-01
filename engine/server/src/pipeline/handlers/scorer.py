"""Scorer handler — memory:extracted -> memory:scored.

Reads extracted facts, scores importance and classifies memory type
using LLM, then publishes enriched facts to memory:scored stream.
"""

import json
import logging
from typing import Any

from src.infra.publish import get_event_bus
from src.memory.scorer import MemoryScorer

logger = logging.getLogger(__name__)


async def scorer_handler(data: dict[str, Any]) -> None:
    """Score extracted facts and publish to memory:scored."""
    conversation_id = data.get("conversation_id", "")
    agent_id = data.get("agent_id", "")
    user_id = data.get("user_id", "")
    facts_raw = data.get("facts", "[]")

    if not conversation_id:
        logger.warning("scorer_handler: missing conversation_id, skipping")
        return

    try:
        facts = json.loads(facts_raw) if isinstance(facts_raw, str) else facts_raw
    except json.JSONDecodeError:
        logger.error(
            "scorer_handler: invalid JSON in facts for conversation %s",
            conversation_id,
        )
        return

    if not facts:
        logger.debug("No facts to score for conversation %s", conversation_id)
        return

    logger.info(
        "Scoring %d facts from conversation %s", len(facts), conversation_id
    )

    scorer = MemoryScorer()
    scored_facts = await scorer.score_facts(facts)

    if not scored_facts:
        logger.info(
            "No facts passed scoring threshold for conversation %s",
            conversation_id,
        )
        return

    # Publish enriched facts to memory:scored stream
    bus = await get_event_bus()
    payload = {
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "user_id": user_id,
        "facts": json.dumps([
            {
                "text": f.text,
                "category": f.category,
                "importance": f.importance,
                "scored_importance": f.scored_importance,
                "memory_type": f.memory_type,
                "entities": f.entities,
            }
            for f in scored_facts
        ]),
    }
    await bus.publish("memory:scored", payload)
    logger.info(
        "Published %d scored facts from conversation %s to memory:scored",
        len(scored_facts),
        conversation_id,
    )
