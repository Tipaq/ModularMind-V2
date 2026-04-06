"""Supervisor dispatch helpers for message routing."""

from fastapi import HTTPException

from src.domain_config import get_config_provider
from src.executions.service import ExecutionService
from src.infra.database import DbSession

from .schemas import (
    BudgetLayerInfo,
    BudgetOverview,
    ContextData,
    ContextHistory,
    ContextHistoryBudget,
    ContextHistoryMessage,
    MessageResponse,
    SendMessageResponse,
)


async def dispatch_supervisor_executions(
    result: dict,
    user_id: str,
    db: DbSession,
    exec_service: ExecutionService,
    redis_client,
    model_override: str | None,
) -> None:
    """Dispatch delegated executions from supervisor to Redis Streams."""
    import json as _json

    from src.executions.scheduler import fair_scheduler

    exec_id = result.get("execution_id")
    exec_ids = result.get("execution_ids")
    first_exec_id = exec_id or (exec_ids[0] if exec_ids else None)
    tool_response_inline = result.get("tool_response_inline", False)

    if not first_exec_id or tool_response_inline:
        return

    await db.commit()
    execution = await exec_service.get_execution(first_exec_id)
    if not execution:
        return

    acquired = await fair_scheduler.acquire(user_id, execution.id)
    if not acquired:
        await db.rollback()
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent executions",
            headers={"Retry-After": "10"},
        )
    await exec_service.dispatch_execution(
        execution,
        ab_model_override=model_override,
    )

    if result.get("routing_metadata"):
        await redis_client.publish(
            f"execution:{first_exec_id}",
            _json.dumps(result["routing_metadata"]),
        )

    if exec_ids and len(exec_ids) > 1:
        for eid in exec_ids[1:]:
            sub_exec = await exec_service.get_execution(eid)
            if sub_exec:
                await exec_service.dispatch_execution(
                    sub_exec,
                    ab_model_override=model_override,
                )


async def build_supervisor_response(
    result: dict,
    user_msg_response: MessageResponse,
) -> SendMessageResponse:
    """Build the SendMessageResponse from supervisor result."""
    routing_meta = result.get("routing_metadata", {})
    routing_strategy = routing_meta.get("strategy")
    delegated_to = None
    is_ephemeral = None

    if routing_meta.get("agent_id"):
        _agent = await get_config_provider().get_agent_config(
            routing_meta["agent_id"],
        )
        if _agent:
            delegated_to = _agent.name
            is_ephemeral = (
                bool(_agent.routing_metadata.get("ephemeral")) if _agent.routing_metadata else False
            )

    context_data_response = None
    raw_context = result.get("context_data")
    if raw_context:
        raw_history = raw_context.get("history", {})
        raw_budget = raw_history.get("budget")
        raw_bo = raw_context.get("budget_overview")
        context_data_response = ContextData(
            history=ContextHistory(
                budget=ContextHistoryBudget(**raw_budget) if raw_budget else None,
                messages=[ContextHistoryMessage(**m) for m in raw_history.get("messages", [])],
                summary=raw_history.get("summary", ""),
            ),
            user_profile=raw_context.get("user_profile"),
            budget_overview=BudgetOverview(
                context_window=raw_bo["context_window"],
                effective_context=raw_bo["effective_context"],
                max_pct=raw_bo["max_pct"],
                layers={k: BudgetLayerInfo(**v) for k, v in raw_bo["layers"].items()},
            )
            if raw_bo
            else None,
        )

    base_kwargs = dict(
        user_message=user_msg_response,
        routing_strategy=routing_strategy,
        context_data=context_data_response,
    )

    exec_id = result.get("execution_id")
    exec_ids = result.get("execution_ids")

    if result.get("direct_response") and not exec_id and not exec_ids:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=None,
            stream_url=None,
            direct_response=result["direct_response"],
        )

    if exec_ids:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_ids[0],
            stream_url=f"/api/v1/executions/{exec_ids[0]}/stream",
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=result.get("ephemeral_agent"),
        )
    else:
        return SendMessageResponse(
            **base_kwargs,
            execution_id=exec_id,
            stream_url=(f"/api/v1/executions/{exec_id}/stream" if exec_id else None),
            delegated_to=delegated_to,
            is_ephemeral=is_ephemeral,
            ephemeral_agent=result.get("ephemeral_agent"),
        )
