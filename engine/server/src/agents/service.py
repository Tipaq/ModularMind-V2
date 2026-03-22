"""
Agent service.

Business logic for agent CRUD operations with versioned storage.
"""

import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import get_config_provider
from src.domain_config.repository import ConfigRepository
from src.graph_engine.interfaces import AgentConfig

from .schemas import AgentCreate, AgentDetail, AgentUpdate

logger = logging.getLogger(__name__)

DEFAULT_TOOL_CATEGORIES: dict[str, bool] = {
    "knowledge": True,
    "filesystem": False,
    "file_storage": False,
    "human_interaction": True,
    "image_generation": False,
    "custom_tools": False,
    "mini_apps": False,
    "github": False,
    "web": False,
    "git": False,
    "scheduling": False,
}


def _build_config_dict(body: AgentCreate, agent_id: str) -> dict[str, Any]:
    merged_categories = {**DEFAULT_TOOL_CATEGORIES, **body.tool_categories}
    rag_config = {
        "enabled": False,
        "collection_ids": [],
        "retrieval_count": 5,
        "similarity_threshold": 0.7,
    }
    if body.rag_config:
        rag_config = {
            "enabled": body.rag_config.enabled,
            "collection_ids": [str(c) for c in body.rag_config.collection_ids],
            "retrieval_count": body.rag_config.retrieval_count,
            "similarity_threshold": body.rag_config.similarity_threshold,
        }
    return {
        "id": agent_id,
        "name": body.name,
        "description": body.description,
        "model_id": body.model_id,
        "system_prompt": body.system_prompt,
        "memory_enabled": body.memory_enabled,
        "timeout_seconds": body.timeout_seconds,
        "rag_config": rag_config,
        "tool_categories": merged_categories,
        "gateway_permissions": body.gateway_permissions,
        "capabilities": body.capabilities,
        "routing_metadata": body.routing_metadata,
    }


def _config_to_detail(
    config: AgentConfig,
    config_version: int | None = None,
    config_hash: str | None = None,
) -> AgentDetail:
    return AgentDetail(
        id=str(config.id),
        name=config.name,
        description=config.description,
        model_id=config.model_id,
        version=config.version,
        memory_enabled=config.memory_enabled,
        timeout_seconds=config.timeout_seconds,
        system_prompt=config.system_prompt,
        rag_enabled=config.rag_config.enabled,
        rag_collection_ids=[str(c) for c in config.rag_config.collection_ids],
        rag_retrieval_count=config.rag_config.retrieval_count,
        rag_similarity_threshold=config.rag_config.similarity_threshold,
        tool_categories=dict(config.tool_categories),
        capabilities=list(config.capabilities),
        gateway_permissions=config.gateway_permissions,
        routing_metadata=dict(config.routing_metadata),
        config_version=config_version,
        config_hash=config_hash,
    )


async def create_agent(
    db: AsyncSession,
    body: AgentCreate,
    user_id: str,
) -> AgentDetail:
    agent_id = str(uuid4())
    config_dict = _build_config_dict(body, agent_id)
    AgentConfig.model_validate(config_dict)

    repo = ConfigRepository(db)
    row = await repo.create_agent_version(
        agent_id,
        config_dict,
        created_by=user_id,
        change_note="Created",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = AgentConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)


async def update_agent(
    db: AsyncSession,
    agent_id: str,
    body: AgentUpdate,
    user_id: str,
) -> AgentDetail:
    repo = ConfigRepository(db)
    existing = await repo.get_active_agent(agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

    config = dict(existing.config)
    updates = body.model_dump(exclude_none=True, exclude={"change_note"})

    if "rag_config" in updates and updates["rag_config"] is not None:
        rag = updates.pop("rag_config")
        config["rag_config"] = {
            "enabled": rag.enabled,
            "collection_ids": [str(c) for c in rag.collection_ids],
            "retrieval_count": rag.retrieval_count,
            "similarity_threshold": rag.similarity_threshold,
        }
    elif "rag_config" in updates:
        updates.pop("rag_config")

    config.update(updates)
    AgentConfig.model_validate(config | {"id": agent_id})

    row = await repo.create_agent_version(
        agent_id,
        config,
        created_by=user_id,
        change_note=body.change_note or "Updated",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = AgentConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)


async def delete_agent(db: AsyncSession, agent_id: str) -> None:
    repo = ConfigRepository(db)
    existing = await repo.get_active_agent(agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

    await repo.delete_agent(agent_id)
    await db.commit()
    await get_config_provider().reload_async()


async def duplicate_agent(
    db: AsyncSession,
    agent_id: str,
    user_id: str,
    new_name: str | None = None,
) -> AgentDetail:
    repo = ConfigRepository(db)
    existing = await repo.get_active_agent(agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

    config = dict(existing.config)
    new_id = str(uuid4())
    config["id"] = new_id
    config["name"] = new_name or f"{config.get('name', 'Agent')} (copy)"

    AgentConfig.model_validate(config)

    row = await repo.create_agent_version(
        new_id,
        config,
        created_by=user_id,
        change_note=f"Duplicated from {agent_id}",
    )
    await db.commit()
    await get_config_provider().reload_async()

    validated = AgentConfig.model_validate(row.config | {"id": row.id})
    return _config_to_detail(validated, config_version=row.version, config_hash=row.config_hash)
