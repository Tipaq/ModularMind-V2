"""
Execution creation functions.

Handles creating ExecutionRun records for agent, raw LLM, graph, and supervisor executions.
"""

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config import ConfigProvider

from .models import ExecutionRun, ExecutionStatus, ExecutionType
from .schemas import ExecutionCreate

logger = logging.getLogger(__name__)


async def inject_project_metadata(
    db: AsyncSession,
    session_id: str | None,
    state: dict[str, Any],
) -> None:
    """Inject project_id and project_repositories into state metadata."""
    if not session_id:
        return

    from src.conversations.models import Conversation
    from src.projects.models import ProjectRepository

    conv_result = await db.execute(
        select(Conversation.project_id).where(Conversation.id == session_id)
    )
    project_id = conv_result.scalar_one_or_none()
    if not project_id:
        return

    state["metadata"]["project_id"] = project_id

    repo_result = await db.execute(
        select(
            ProjectRepository.repo_identifier,
            ProjectRepository.repo_url,
            ProjectRepository.display_name,
        ).where(ProjectRepository.project_id == project_id)
    )
    repos = [
        {"repo_identifier": r.repo_identifier, "repo_url": r.repo_url, "display_name": r.display_name}
        for r in repo_result.all()
    ]
    if repos:
        state["metadata"]["project_repositories"] = repos


async def start_agent_execution(
    db: AsyncSession,
    config_provider: ConfigProvider,
    agent_id: str,
    data: ExecutionCreate,
    user_id: str,
) -> ExecutionRun:
    """Start an agent execution.

    Args:
        db: Database session
        config_provider: Configuration provider
        agent_id: Agent ID to execute
        data: Execution parameters
        user_id: User initiating the execution

    Returns:
        Created ExecutionRun

    Raises:
        ValueError: If agent not found
    """
    agent = await config_provider.get_agent_config(agent_id)
    if not agent:
        raise ValueError(f"Agent not found: {agent_id}")

    version_number = config_provider.get_config_version_number("agent", agent_id)
    hash_value = config_provider.get_config_version("agent", agent_id)

    execution = ExecutionRun(
        id=str(uuid4()),
        execution_type=ExecutionType.AGENT,
        agent_id=agent_id,
        session_id=data.session_id,
        user_id=user_id,
        status=ExecutionStatus.PENDING,
        config_version=version_number,
        config_hash=hash_value,
        input_prompt=data.prompt,
        input_data=data.input_data or {},
        model=getattr(agent, "model_id", None),
    )

    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    logger.info("Created execution %s for agent %s", execution.id, agent_id)
    return execution


async def start_raw_execution(
    db: AsyncSession,
    model_id: str,
    data: ExecutionCreate,
    user_id: str,
) -> ExecutionRun:
    """Start a raw LLM execution (no agent, direct model call)."""
    execution = ExecutionRun(
        id=str(uuid4()),
        execution_type=ExecutionType.AGENT,
        agent_id=None,
        session_id=data.session_id,
        user_id=user_id,
        status=ExecutionStatus.PENDING,
        input_prompt=data.prompt,
        input_data={
            **(data.input_data or {}),
            "_raw_model_id": model_id,
        },
        model=model_id,
    )

    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    logger.info("Created raw LLM execution %s with model %s", execution.id, model_id)
    return execution


async def start_graph_execution(
    db: AsyncSession,
    config_provider: ConfigProvider,
    graph_id: str,
    data: ExecutionCreate,
    user_id: str,
) -> ExecutionRun:
    """Start a graph execution.

    Args:
        db: Database session
        config_provider: Configuration provider
        graph_id: Graph ID to execute
        data: Execution parameters
        user_id: User initiating the execution

    Returns:
        Created ExecutionRun

    Raises:
        ValueError: If graph not found
    """
    graph = await config_provider.get_graph_config(graph_id)
    if not graph:
        raise ValueError(f"Graph not found: {graph_id}")

    version_number = config_provider.get_config_version_number("graph", graph_id)
    hash_value = config_provider.get_config_version("graph", graph_id)

    execution = ExecutionRun(
        id=str(uuid4()),
        execution_type=ExecutionType.GRAPH,
        graph_id=graph_id,
        session_id=data.session_id,
        user_id=user_id,
        status=ExecutionStatus.PENDING,
        config_version=version_number,
        config_hash=hash_value,
        input_prompt=data.prompt,
        input_data=data.input_data or {},
    )

    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    logger.info("Created execution %s for graph %s", execution.id, graph_id)
    return execution


async def start_supervisor_execution(
    db: AsyncSession,
    config_provider: ConfigProvider,
    conversation_id: str,
    input_prompt: str,
    user_id: str,
    agent_id: str | None = None,
) -> ExecutionRun:
    """Create an ExecutionRun typed as SUPERVISOR for tracking/analytics.

    This is a lightweight parent record — the actual work runs in
    AGENT/GRAPH sub-executions. SUPERVISOR records are tracking records only.

    Args:
        db: Database session
        config_provider: Configuration provider
        conversation_id: The conversation this execution belongs to
        input_prompt: The user message that triggered routing
        user_id: User who initiated the execution
        agent_id: Optional agent ID if routing to a specific agent
    """
    version_number = (
        config_provider.get_config_version_number("agent", agent_id) if agent_id else None
    )
    hash_value = (
        config_provider.get_config_version("agent", agent_id) if agent_id else None
    )

    execution = ExecutionRun(
        id=str(uuid4()),
        execution_type=ExecutionType.SUPERVISOR,
        agent_id=agent_id,
        session_id=conversation_id,
        user_id=user_id,
        status=ExecutionStatus.PENDING,
        config_version=version_number,
        config_hash=hash_value,
        input_prompt=input_prompt,
        input_data={},
    )

    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    logger.info(
        "Created supervisor execution %s for conversation %s",
        execution.id,
        conversation_id,
    )
    return execution
