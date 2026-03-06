"""Shared helpers for pipeline handlers."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PipelineContext:
    """Common fields parsed from a pipeline message."""

    conversation_id: str
    agent_id: str | None
    user_id: str | None
    facts: list[dict] | None
    messages: list[dict] | None


def parse_pipeline_data(data: dict) -> PipelineContext | None:
    """Parse common fields from pipeline message data.

    Returns None if conversation_id is missing.
    """
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        logger.error("Pipeline message missing conversation_id")
        return None

    agent_id = data.get("agent_id")
    user_id = data.get("user_id")

    facts = None
    raw_facts = data.get("facts")
    if raw_facts:
        facts = json.loads(raw_facts) if isinstance(raw_facts, str) else raw_facts

    messages = None
    raw_messages = data.get("messages")
    if raw_messages:
        messages = json.loads(raw_messages) if isinstance(raw_messages, str) else raw_messages

    return PipelineContext(
        conversation_id=conversation_id,
        agent_id=agent_id,
        user_id=user_id,
        facts=facts,
        messages=messages,
    )
