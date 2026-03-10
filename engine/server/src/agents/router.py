"""
Agents router.

API endpoints for listing agents (read-only from config).
"""

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser
from src.domain_config import get_config_provider

from .schemas import AgentDetail, AgentListResponse, AgentSummary

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

    # Filter by version
    if version:
        agents = [a for a in agents if a.version == version]

    # Filter by search term (name or description)
    if search:
        q = search.lower()
        agents = [a for a in agents if q in a.name.lower() or q in (a.description or "").lower()]

    total = len(agents)

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_agents = agents[start:end]

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
async def get_agent(
    agent_id: str,
    user: CurrentUser,
) -> AgentDetail:
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
        config_version=version_number or 0,
        config_hash=config_hash,
    )
