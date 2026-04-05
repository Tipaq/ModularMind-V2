"""
Agents router.

API endpoints for agent CRUD and listing.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from src.auth import CurrentUser, RequireOwner
from src.domain_config import get_config_provider
from src.infra.database import DbSession

from . import service
from .schemas import (
    AgentCreate,
    AgentDetail,
    AgentListResponse,
    AgentSummary,
    AgentUpdate,
    DuplicateAgentRequest,
)

router = APIRouter(prefix="/agents", tags=["Agents"])


@router.get("", response_model=AgentListResponse)
async def list_agents(
    user: CurrentUser,
    page: int = 1,
    page_size: int = 20,
    version: int | None = None,
    search: str | None = None,
) -> AgentListResponse:
    """List available agents."""
    config_provider = get_config_provider()
    agents = await config_provider.list_agents()

    if version:
        agents = [a for a in agents if a.version == version]

    if search:
        q = search.lower()
        agents = [a for a in agents if q in a.name.lower() or q in (a.description or "").lower()]

    total = len(agents)
    start = (page - 1) * page_size
    page_agents = agents[start : start + page_size]

    items = [
        AgentSummary(
            id=str(a.id),
            name=a.name,
            description=a.description,
            model_id=a.model_id,
            version=a.version,
            memory_enabled=a.memory_enabled,
            timeout_seconds=a.timeout_seconds,
            system_prompt=a.system_prompt,
            rag_enabled=a.rag_config.enabled,
            rag_collection_ids=[str(c) for c in a.rag_config.collection_ids],
            rag_retrieval_count=a.rag_config.retrieval_count,
            rag_similarity_threshold=a.rag_config.similarity_threshold,
            tool_categories=dict(a.tool_categories),
            tool_mode=getattr(a, "tool_mode", "direct"),
        )
        for a in page_agents
    ]

    return AgentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{agent_id}", response_model=AgentDetail)
async def get_agent(agent_id: str, user: CurrentUser) -> AgentDetail:
    """Get agent details."""
    config_provider = get_config_provider()
    agent = await config_provider.get_agent_config(agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    config_hash = config_provider.get_config_version("agent", agent_id)
    version_number = config_provider.get_config_version_number("agent", agent_id)

    return AgentDetail(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        model_id=agent.model_id,
        version=agent.version,
        memory_enabled=agent.memory_enabled,
        timeout_seconds=agent.timeout_seconds,
        system_prompt=agent.system_prompt,
        rag_enabled=agent.rag_config.enabled,
        rag_collection_ids=[str(c) for c in agent.rag_config.collection_ids],
        rag_retrieval_count=agent.rag_config.retrieval_count,
        rag_similarity_threshold=agent.rag_config.similarity_threshold,
        tool_categories=dict(agent.tool_categories),
        tool_mode=getattr(agent, "tool_mode", "direct"),
        capabilities=list(agent.capabilities),
        gateway_permissions=agent.gateway_permissions,
        routing_metadata=dict(agent.routing_metadata),
        config_version=version_number or 0,
        config_hash=config_hash,
    )


@router.post(
    "",
    response_model=AgentDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireOwner],
)
async def create_agent(body: AgentCreate, user: CurrentUser, db: DbSession) -> AgentDetail:
    """Create a new agent."""
    try:
        return await service.create_agent(db, body, user.id)
    except IntegrityError as err:
        raise HTTPException(status_code=409, detail="Agent creation conflict") from err


@router.patch(
    "/{agent_id}",
    response_model=AgentDetail,
    dependencies=[RequireOwner],
)
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    user: CurrentUser,
    db: DbSession,
) -> AgentDetail:
    """Update an existing agent (creates a new version)."""
    return await service.update_agent(db, agent_id, body, user.id)


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[RequireOwner],
)
async def delete_agent(agent_id: str, db: DbSession) -> None:
    """Delete an agent and all its versions."""
    await service.delete_agent(db, agent_id)


@router.post(
    "/{agent_id}/duplicate",
    response_model=AgentDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireOwner],
)
async def duplicate_agent(
    agent_id: str,
    user: CurrentUser,
    db: DbSession,
    body: DuplicateAgentRequest | None = None,
) -> AgentDetail:
    """Duplicate an existing agent."""
    new_name = body.name if body else None
    return await service.duplicate_agent(db, agent_id, user.id, new_name)
