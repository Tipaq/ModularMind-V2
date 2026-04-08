"""Connector Builder graph — AI-generates connector specs for external APIs.

Creates agents + graph config at startup if they don't exist.
The graph is: discovery → designer → validator ⇄ designer → tester → end.
"""

from __future__ import annotations

import hashlib
import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.builder_prompts import (
    DESIGNER_PROMPT,
    DISCOVERY_PROMPT,
    TESTER_PROMPT,
    VALIDATOR_PROMPT,
)

logger = logging.getLogger(__name__)

BUILDER_GRAPH_NAME = "API Connector Builder"
BUILDER_GRAPH_DESCRIPTION = (
    "AI-generates connector specs for external APIs. "
    "Researches the target API, designs a connector spec, "
    "validates it, and tests connectivity."
)

_AGENT_DEFS = [
    {
        "name": "API Discovery Agent",
        "prompt": DISCOVERY_PROMPT,
        "tools": {"web": True},
        "capabilities": ["research"],
    },
    {
        "name": "Connector Designer Agent",
        "prompt": DESIGNER_PROMPT,
        "tools": {},
        "capabilities": ["analysis"],
    },
    {
        "name": "Spec Validator Agent",
        "prompt": VALIDATOR_PROMPT,
        "tools": {},
        "capabilities": ["analysis"],
    },
    {
        "name": "Connector Tester Agent",
        "prompt": TESTER_PROMPT,
        "tools": {"network": True},
        "capabilities": ["testing"],
    },
]

_ALL_PROMPTS = (
    DISCOVERY_PROMPT + DESIGNER_PROMPT
    + VALIDATOR_PROMPT + TESTER_PROMPT
)
_PROMPT_HASH = hashlib.sha256(_ALL_PROMPTS.encode()).hexdigest()[:16]


async def seed_connector_builder(
    session: AsyncSession, model_id: str
) -> None:
    """Create the Connector Builder graph + agents if they don't exist.

    Called from main.py lifespan (leader-only). Idempotent.
    """
    from src.domain_config import get_config_provider
    from src.domain_config.repository import ConfigRepository

    repo = ConfigRepository(session)

    existing = await repo.find_active_graph_by_name(BUILDER_GRAPH_NAME)
    if existing:
        logger.debug(
            "API Connector Builder graph already exists: %s",
            existing.id,
        )
        return

    agent_ids = await _create_builder_agents(repo, session, model_id)
    await _create_builder_graph(repo, session, agent_ids)
    await session.commit()
    await get_config_provider().reload_async()
    logger.info(
        "Seeded API Connector Builder graph with %d agents",
        len(agent_ids),
    )


async def _create_builder_agents(
    repo, session: AsyncSession, model_id: str
) -> list[str]:
    """Create the 4 builder agents and return their IDs."""
    from src.infra.constants import DEFAULT_TOOL_CATEGORIES

    agent_ids: list[str] = []
    for agent_def in _AGENT_DEFS:
        agent_id = str(uuid4())
        tool_cats = {**DEFAULT_TOOL_CATEGORIES}
        for cat, enabled in agent_def.get("tools", {}).items():
            tool_cats[cat] = enabled

        config = {
            "id": agent_id,
            "name": agent_def["name"],
            "description": "Part of the API Connector Builder graph",
            "model_id": model_id,
            "system_prompt": agent_def["prompt"],
            "memory_enabled": False,
            "timeout_seconds": 300,
            "rag_config": {
                "enabled": False,
                "collection_ids": [],
                "retrieval_count": 5,
                "similarity_threshold": 0.5,
            },
            "tool_categories": tool_cats,
            "gateway_permissions": agent_def.get(
                "gateway_permissions"
            ),
            "capabilities": agent_def.get("capabilities", []),
            "routing_metadata": {
                "connector_builder": True,
                "prompt_hash": _PROMPT_HASH,
            },
        }

        await repo.create_agent_version(
            agent_id,
            config,
            created_by="system",
            change_note="API Connector Builder seed",
        )
        agent_ids.append(agent_id)

    return agent_ids


async def _create_builder_graph(
    repo, session: AsyncSession, agent_ids: list[str]
) -> str:
    """Create the builder graph with the 4 agent nodes."""
    graph_id = str(uuid4())

    discovery_id, designer_id, validator_id, tester_id = agent_ids

    nodes = [
        {"id": "start", "type": "start", "data": {}},
        {
            "id": "discovery",
            "type": "agent",
            "data": {
                "agent_id": discovery_id,
                "label": "API Discovery",
            },
        },
        {
            "id": "designer",
            "type": "agent",
            "data": {
                "agent_id": designer_id,
                "label": "Spec Design",
            },
        },
        {
            "id": "validator",
            "type": "agent",
            "data": {
                "agent_id": validator_id,
                "label": "Spec Validation",
            },
        },
        {
            "id": "valid_check",
            "type": "condition",
            "data": {
                "expression": (
                    "node_outputs.get('validator', {})"
                    ".get('valid') is True"
                ),
                "true_target": "tester",
                "false_target": "designer",
            },
        },
        {
            "id": "tester",
            "type": "agent",
            "data": {
                "agent_id": tester_id,
                "label": "Connectivity Test",
            },
        },
        {"id": "end", "type": "end", "data": {}},
    ]

    edges = [
        {
            "id": "e1",
            "source": "start",
            "target": "discovery",
            "data": {},
        },
        {
            "id": "e2",
            "source": "discovery",
            "target": "designer",
            "data": {},
        },
        {
            "id": "e3",
            "source": "designer",
            "target": "validator",
            "data": {},
        },
        {
            "id": "e4",
            "source": "validator",
            "target": "valid_check",
            "data": {},
        },
        {
            "id": "e5",
            "source": "valid_check",
            "target": "tester",
            "data": {},
        },
        {
            "id": "e6",
            "source": "valid_check",
            "target": "designer",
            "data": {},
        },
        {
            "id": "e7",
            "source": "tester",
            "target": "end",
            "data": {},
        },
    ]

    config = {
        "id": graph_id,
        "name": BUILDER_GRAPH_NAME,
        "description": BUILDER_GRAPH_DESCRIPTION,
        "timeout_seconds": 600,
        "entry_node_id": "start",
        "nodes": nodes,
        "edges": edges,
    }

    await repo.create_graph_version(
        graph_id,
        config,
        created_by="system",
        change_note="API Connector Builder seed",
    )
    return graph_id
