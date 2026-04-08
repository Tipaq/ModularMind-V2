"""Shared webhook execution logic — route to agent, graph, supervisor, or raw LLM."""

import asyncio
import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.adapters.base import ExtractedMessage, PlatformAdapter
from src.connectors.models import Connector
from src.executions.scheduler import fair_scheduler
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService
from src.infra.constants import WEBHOOK_BACKGROUND_MAX_CONCURRENT
from src.infra.database import async_session_maker

logger = logging.getLogger(__name__)

_background_semaphore = asyncio.Semaphore(WEBHOOK_BACKGROUND_MAX_CONCURRENT)
_background_tasks: set[asyncio.Task] = set()


async def _create_execution(
    exec_service: ExecutionService,
    connector: Connector,
    message: ExtractedMessage,
    user_id: str,
):
    """Create the right execution type based on connector mode."""
    data = ExecutionCreate(prompt=message.text)

    if connector.supervisor_mode:
        return await _run_supervisor(exec_service, connector, message, user_id)

    if connector.graph_id:
        return await exec_service.start_graph_execution(
            graph_id=connector.graph_id, data=data, user_id=user_id
        )

    if connector.agent_id:
        return await exec_service.start_agent_execution(
            agent_id=connector.agent_id, data=data, user_id=user_id
        )

    model_id = (connector.config or {}).get("model_id", "")
    if model_id:
        return await exec_service.start_raw_execution(model_id=model_id, data=data, user_id=user_id)

    raise HTTPException(
        status_code=500,
        detail="Connector has no execution target (agent, graph, supervisor, or model)",
    )


async def _run_supervisor(
    exec_service: ExecutionService,
    connector: Connector,
    message: ExtractedMessage,
    user_id: str,
):
    """Run supervisor routing and create execution for the chosen target."""
    from src.supervisor.service import SuperSupervisorService

    conv_config = connector.config or {}
    supervisor = SuperSupervisorService(exec_service.db)

    result = await supervisor.process_message(
        conversation_id=f"connector:{connector.id}",
        content=message.text,
        user_id=user_id,
        conv_config=conv_config,
    )

    execution_id = result.get("execution_id")
    if execution_id:
        from sqlalchemy import select

        from src.executions.models import ExecutionRun

        stmt = select(ExecutionRun).where(ExecutionRun.id == execution_id)
        row = await exec_service.db.execute(stmt)
        return row.scalar_one()

    direct_response = result.get("direct_response", "")
    if direct_response:
        return _DirectResponse(text=direct_response)

    raise HTTPException(status_code=500, detail="Supervisor returned no execution or response")


class _DirectResponse:
    """Sentinel for supervisor direct responses (no execution needed)."""

    def __init__(self, text: str):
        self.text = text


async def _dispatch_and_collect(db: AsyncSession, exec_service: ExecutionService, execution) -> str:
    """Dispatch execution and wait for response inline."""
    acquired = await fair_scheduler.acquire("webhook", execution.id)
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent executions. Try again later.",
            headers={"Retry-After": "10"},
        )

    await exec_service.dispatch_execution(execution)
    await db.commit()

    response_text = ""
    async for event in exec_service.execute(execution.id):
        if event.get("type") == "complete":
            output = event.get("output", {})
            response_text = output.get("response", str(output))
            break

    await db.commit()
    return response_text or "No response generated."


async def execute_and_collect(
    db: AsyncSession,
    connector: Connector,
    message: ExtractedMessage,
) -> str:
    """Run connector execution inline and return the response text."""
    exec_service = ExecutionService(db)
    user_id = f"system:webhook:{connector.id}"

    execution = await _create_execution(exec_service, connector, message, user_id)
    await db.commit()

    if isinstance(execution, _DirectResponse):
        return execution.text

    return await _dispatch_and_collect(db, exec_service, execution)


async def _run_background(
    adapter: PlatformAdapter,
    connector_id: str,
    connector_agent_id: str | None,
    connector_graph_id: str | None,
    connector_supervisor_mode: bool,
    connector_config: dict,
    message: ExtractedMessage,
    credentials: dict[str, str],
) -> None:
    """Background task: execute then deliver response via adapter."""
    async with _background_semaphore, async_session_maker() as db:
        try:
            fake_connector = _ConnectorSnapshot(
                id=connector_id,
                agent_id=connector_agent_id,
                graph_id=connector_graph_id,
                supervisor_mode=connector_supervisor_mode,
                config=connector_config,
            )
            response_text = await execute_and_collect(db, fake_connector, message)
            await adapter.send_response(
                message.platform_context, response_text, credentials
            )
        except (RuntimeError, ValueError, OSError, ConnectionError, TimeoutError) as exc:
            logger.exception("Background webhook execution failed for %s: %s", connector_id, exc)
            await adapter.send_response(
                message.platform_context,
                "An error occurred while processing your request.",
                credentials,
            )


class _ConnectorSnapshot:
    """Lightweight snapshot of connector fields for background tasks."""

    def __init__(
        self,
        id: str,
        agent_id: str | None,
        graph_id: str | None,
        supervisor_mode: bool,
        config: dict,
    ):
        self.id = id
        self.agent_id = agent_id
        self.graph_id = graph_id
        self.supervisor_mode = supervisor_mode
        self.config = config


def launch_background_execution(
    adapter: PlatformAdapter,
    connector: Connector,
    message: ExtractedMessage,
    credentials: dict[str, str],
) -> None:
    """Fire a background task for deferred-execution platforms."""
    task = asyncio.create_task(
        _run_background(
            adapter,
            connector.id,
            connector.agent_id,
            connector.graph_id,
            connector.supervisor_mode,
            connector.config or {},
            message,
            credentials,
        ),
        name=f"webhook-bg-{connector.id[:8]}",
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
