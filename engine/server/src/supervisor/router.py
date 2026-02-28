"""
Supervisor router.

API endpoints for supervisor-specific operations:
- Ephemeral agent management (save, list)
"""

import logging

from fastapi import APIRouter, HTTPException

from src.auth import CurrentUser, RequireOwner
from src.domain_config import get_config_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/supervisor", tags=["Supervisor"])


@router.post("/agents/{agent_id}/save", dependencies=[RequireOwner])
async def save_ephemeral_agent(
    agent_id: str,
    user: CurrentUser,
) -> dict:
    """Persist an ephemeral agent to disk.

    Moves the agent from Redis (ephemeral) to CONFIG_DIR/agents/ (permanent).
    """
    config_provider = get_config_provider()
    if not await config_provider.is_ephemeral(agent_id):
        raise HTTPException(status_code=404, detail="Ephemeral agent not found")

    success = await config_provider.save_ephemeral_agent(agent_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save agent")

    return {"status": "saved", "agent_id": agent_id}


@router.get("/agents/ephemeral", dependencies=[RequireOwner])
async def list_ephemeral_agents(
    user: CurrentUser,
) -> dict:
    """List currently active ephemeral agents."""
    config_provider = get_config_provider()
    agents = await config_provider.list_ephemeral_agents()
    return {
        "agents": [a.model_dump(mode="json") for a in agents],
    }
