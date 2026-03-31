"""Connector Builder graph — auto-generates MCP connectors for external systems.

Creates agents + graph config at startup if they don't exist.
The graph is: discovery → analyzer → generator ⇄ tester → deployer.
"""

from __future__ import annotations

import hashlib
import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.system_indexer.prompts import (
    ANALYZER_PROMPT,
    DEPLOYER_PROMPT,
    DISCOVERY_PROMPT,
    GENERATOR_PROMPT,
    TESTER_PROMPT,
)

logger = logging.getLogger(__name__)

BUILDER_GRAPH_NAME = "Connector Builder"
BUILDER_GRAPH_DESCRIPTION = (
    "Auto-generates MCP server connectors for external systems "
    "(ERPs, databases, APIs). Researches the target, generates code, "
    "tests it, and deploys as an MCP sidecar."
)

_AGENT_DEFS = [
    {
        "name": "Connector Discovery Agent",
        "prompt": DISCOVERY_PROMPT,
        "tools": {"web": True, "knowledge": True},
        "capabilities": ["research"],
    },
    {
        "name": "Connector Analyzer Agent",
        "prompt": ANALYZER_PROMPT,
        "tools": {"knowledge": True},
        "capabilities": ["analysis"],
    },
    {
        "name": "Connector Generator Agent",
        "prompt": GENERATOR_PROMPT,
        "tools": {"filesystem": True, "shell": True},
        "gateway_permissions": {
            "filesystem": {"enabled": True, "read": ["*"], "write": ["/workspace/**"]},
            "shell": {"enabled": True, "allow": ["*"]},
        },
        "capabilities": ["code"],
    },
    {
        "name": "Connector Tester Agent",
        "prompt": TESTER_PROMPT,
        "tools": {"shell": True, "human_interaction": True},
        "gateway_permissions": {
            "shell": {"enabled": True, "allow": ["*"]},
        },
        "capabilities": ["testing"],
    },
    {
        "name": "Connector Deployer Agent",
        "prompt": DEPLOYER_PROMPT,
        "tools": {},
        "capabilities": ["deployment"],
    },
]

_ALL_PROMPTS = (
    DISCOVERY_PROMPT + ANALYZER_PROMPT + GENERATOR_PROMPT
    + TESTER_PROMPT + DEPLOYER_PROMPT
)
_PROMPT_HASH = hashlib.sha256(_ALL_PROMPTS.encode()).hexdigest()[:16]


async def seed_system_indexer(session: AsyncSession, model_id: str) -> None:
    """Create the Connector Builder graph + agents if they don't exist.

    Called from main.py lifespan (leader-only). Idempotent.
    """
    from src.domain_config import get_config_provider
    from src.domain_config.repository import ConfigRepository

    provider = get_config_provider()
    repo = ConfigRepository(session)

    existing_graph = _find_existing_graph(provider)
    if existing_graph:
        logger.debug("Connector Builder graph already exists: %s", existing_graph)
        return

    agent_ids = await _create_builder_agents(repo, session, model_id)
    await _create_builder_graph(repo, session, agent_ids)
    await session.commit()
    await provider.reload_async()
    logger.info("Seeded Connector Builder graph with %d agents", len(agent_ids))


def _find_existing_graph(provider) -> str | None:
    """Check if the builder graph already exists."""
    for graph_id, graph in provider._graphs.items():
        if graph.get("name") == BUILDER_GRAPH_NAME:
            return graph_id
    return None


async def _create_builder_agents(
    repo, session: AsyncSession, model_id: str
) -> list[str]:
    """Create the 5 builder agents and return their IDs."""
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
            "description": "Part of the Connector Builder graph",
            "model_id": model_id,
            "system_prompt": agent_def["prompt"],
            "memory_enabled": False,
            "timeout_seconds": 300,
            "rag_config": {
                "enabled": agent_def["name"] == "Connector Analyzer Agent",
                "collection_ids": [],
                "retrieval_count": 5,
                "similarity_threshold": 0.5,
            },
            "tool_categories": tool_cats,
            "gateway_permissions": agent_def.get("gateway_permissions"),
            "capabilities": agent_def.get("capabilities", []),
            "routing_metadata": {"builder_graph": True, "prompt_hash": _PROMPT_HASH},
        }

        await repo.create_agent_version(
            agent_id, config, created_by="system", change_note="Connector Builder seed"
        )
        agent_ids.append(agent_id)

    return agent_ids


async def _create_builder_graph(
    repo, session: AsyncSession, agent_ids: list[str]
) -> str:
    """Create the builder graph with the 5 agent nodes."""
    graph_id = str(uuid4())

    discovery_id, analyzer_id, generator_id, tester_id, deployer_id = agent_ids

    nodes = [
        {"id": "start", "type": "start", "data": {}},
        {
            "id": "discovery",
            "type": "agent",
            "data": {"agent_id": discovery_id, "label": "Discovery"},
        },
        {
            "id": "analyzer",
            "type": "agent",
            "data": {"agent_id": analyzer_id, "label": "Analyzer"},
        },
        {
            "id": "generator",
            "type": "agent",
            "data": {"agent_id": generator_id, "label": "Generator"},
        },
        {
            "id": "tester",
            "type": "agent",
            "data": {"agent_id": tester_id, "label": "Tester"},
        },
        {
            "id": "test_check",
            "type": "condition",
            "data": {
                "expression": "node_outputs.get('tester', {}).get('overall') == 'pass'",
                "true_target": "deployer",
                "false_target": "generator",
            },
        },
        {
            "id": "deployer",
            "type": "agent",
            "data": {"agent_id": deployer_id, "label": "Deployer"},
        },
        {"id": "end", "type": "end", "data": {}},
    ]

    edges = [
        {"id": "e1", "source": "start", "target": "discovery", "data": {}},
        {"id": "e2", "source": "discovery", "target": "analyzer", "data": {}},
        {"id": "e3", "source": "analyzer", "target": "generator", "data": {}},
        {"id": "e4", "source": "generator", "target": "tester", "data": {}},
        {"id": "e5", "source": "tester", "target": "test_check", "data": {}},
        {"id": "e6", "source": "test_check", "target": "deployer", "data": {}},
        {"id": "e7", "source": "test_check", "target": "generator", "data": {}},
        {"id": "e8", "source": "deployer", "target": "end", "data": {}},
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
        graph_id, config, created_by="system", change_note="Connector Builder seed"
    )
    return graph_id
