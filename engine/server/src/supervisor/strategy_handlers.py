"""
Strategy handlers — execution handlers for each routing strategy.
"""

import logging
from collections.abc import Callable, Coroutine
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.provider import ConfigProvider
from src.executions.schemas import ExecutionCreate
from src.executions.service import ExecutionService

from .context_manager import HierarchicalContextManager
from .ephemeral_factory import EphemeralAgentFactory
from .schemas import RoutingDecision, RoutingStrategy

logger = logging.getLogger(__name__)

ExecuteStrategyFn = Callable[
    [RoutingDecision, str, str, str, dict[str, Any]],
    Coroutine[Any, Any, dict[str, Any]],
]


async def handle_direct_response(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    conv_config: dict[str, Any],
    exec_service: ExecutionService,
) -> dict[str, Any]:
    """Handle DIRECT_RESPONSE — create a raw execution for SSE streaming."""
    from src.prompt_layers import get_supervisor_identity

    model_id = conv_config.get("model_id", "ollama:qwen3:8b")

    raw_input: dict = {
        "routing_strategy": "DIRECT_RESPONSE",
        "_supervisor_direct": True,
        "_raw_system_prompt": get_supervisor_identity(),
    }
    if conv_config.get("temperature") is not None:
        raw_input["_raw_temperature"] = conv_config["temperature"]
    if conv_config.get("max_tokens") is not None:
        raw_input["_raw_max_tokens"] = conv_config["max_tokens"]
    execution_data = ExecutionCreate(
        prompt=content,
        session_id=conv_id,
        input_data=raw_input,
    )
    execution = await exec_service.start_raw_execution(
        model_id=model_id,
        data=execution_data,
        user_id=user_id,
    )

    return {
        "execution_id": execution.id,
    }


async def handle_agent_delegation(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    conv_config: dict[str, Any],
    db: AsyncSession,
    config_provider: ConfigProvider,
    context_manager: HierarchicalContextManager,
    exec_service: ExecutionService,
) -> dict[str, Any]:
    """Handle DELEGATE_AGENT — create execution record for an agent."""
    agent_id = decision.agent_id
    if not agent_id:
        return {
            "direct_response": "No agent specified for delegation",
            "execution_id": None,
        }

    agent = await config_provider.get_agent_config(agent_id)
    if not agent:
        return {
            "direct_response": f"Agent {agent_id} not found",
            "execution_id": None,
        }

    # Rebuild sub-context if Redis cache miss
    sub_ctx = await context_manager.get_sub_context(conv_id, agent_id)
    if not sub_ctx:
        from src.conversations.service import ConversationService

        conv_service = ConversationService(db)
        conv = await conv_service.get_conversation(conv_id)
        if conv and conv.messages:
            msg_dicts = [
                {"role": m.role.value, "content": m.content, "meta": m.meta}
                for m in conv.messages
            ]
            await context_manager.rebuild_from_messages(
                conv_id,
                msg_dicts,
            )

    input_data: dict[str, Any] = {
        "routing_strategy": decision.strategy.value,
        "delegated_to": agent.name,
    }
    execution_data = ExecutionCreate(
        prompt=content,
        session_id=conv_id,
        input_data=input_data,
    )
    execution = await exec_service.start_agent_execution(
        agent_id=agent_id,
        data=execution_data,
        user_id=user_id,
    )

    await context_manager.set_last_agent(conv_id, agent_id)

    return {"execution_id": execution.id}


async def handle_graph_execution(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    db: AsyncSession,
    config_provider: ConfigProvider,
    context_manager: HierarchicalContextManager,
    exec_service: ExecutionService,
) -> dict[str, Any]:
    """Handle EXECUTE_GRAPH — create execution record for a graph."""
    graph_id = decision.graph_id
    if not graph_id:
        # LLM may have put the id in agent_id instead — fall back to delegation
        if decision.agent_id:
            logger.info(
                "EXECUTE_GRAPH has no graph_id but agent_id=%s — falling back to DELEGATE_AGENT",
                decision.agent_id,
            )
            decision.strategy = RoutingStrategy.DELEGATE_AGENT
            return await handle_agent_delegation(
                decision,
                conv_id,
                content,
                user_id,
                {},
                db,
                config_provider,
                context_manager,
                exec_service,
            )
        return {
            "direct_response": "No graph specified for execution",
            "execution_id": None,
        }

    graph_config = await config_provider.get_graph_config(graph_id)
    # If the graph doesn't exist, the LLM may have confused an agent for a graph.
    # Try graph_id as an agent_id, or fall back to decision.agent_id.
    if not graph_config:
        fallback_agent_id = decision.agent_id
        # Check if graph_id is actually an agent
        if not fallback_agent_id:
            agent_check = await config_provider.get_agent_config(graph_id)
            if agent_check:
                fallback_agent_id = graph_id
        if fallback_agent_id:
            logger.info(
                "Graph %s not found, falling back to DELEGATE_AGENT with agent_id=%s",
                graph_id,
                fallback_agent_id,
            )
            decision.agent_id = fallback_agent_id
            decision.strategy = RoutingStrategy.DELEGATE_AGENT
            return await handle_agent_delegation(
                decision,
                conv_id,
                content,
                user_id,
                {},
                db,
                config_provider,
                context_manager,
                exec_service,
            )
    graph_name = graph_config.name if graph_config else graph_id

    execution_data = ExecutionCreate(
        prompt=content,
        session_id=conv_id,
        input_data={
            "routing_strategy": decision.strategy.value,
            "delegated_to": graph_name,
        },
    )
    execution = await exec_service.start_graph_execution(
        graph_id=graph_id,
        data=execution_data,
        user_id=user_id,
    )

    return {"execution_id": execution.id}


async def handle_create_agent(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    conv_config: dict[str, Any],
    db: AsyncSession,
    config_provider: ConfigProvider,
    context_manager: HierarchicalContextManager,
    exec_service: ExecutionService,
    ephemeral_factory: EphemeralAgentFactory,
) -> dict[str, Any]:
    """Handle CREATE_AGENT — create ephemeral agent, then delegate."""
    try:
        ec = decision.ephemeral_config or {}
        conv_model_id = conv_config.get("model_id")
        mcp_tool_categories: dict[str, bool] | None = None
        try:
            from src.mcp.service import get_mcp_registry

            registry = get_mcp_registry()
            enabled = [s for s in registry.list_servers() if s.enabled]
            if enabled:
                mcp_tool_categories = {f"mcp:{s.name}": True for s in enabled}
        except (ImportError, RuntimeError):
            pass

        inherited_gateway = ec.get("gateway_permissions") or conv_config.get(
            "gateway_permissions"
        )

        agent = await ephemeral_factory.create_agent(
            name=ec.get("name", "Ephemeral Agent"),
            description=ec.get("description", ""),
            system_prompt=ec.get("system_prompt", "You are a helpful assistant."),
            conversation_id=conv_id,
            model_id=ec.get("model_id") or conv_model_id,
            capabilities=ec.get("capabilities"),
            rag_collections=ec.get("rag_collections"),
            mcp_tool_categories=mcp_tool_categories,
            tool_categories=ec.get("tool_categories"),
            gateway_permissions=inherited_gateway,
            tool_mode=ec.get("tool_mode"),
            timeout_seconds=ec.get("timeout_seconds"),
            memory_enabled=ec.get("memory_enabled"),
        )
    except ValueError as e:
        return {
            "direct_response": f"Cannot create agent: {e}",
            "execution_id": None,
            "error": str(e),
        }

    delegate_decision = RoutingDecision(
        strategy=RoutingStrategy.DELEGATE_AGENT,
        agent_id=str(agent.id),
        reasoning=f"Delegating to newly created ephemeral agent: {agent.name}",
        confidence=1.0,
    )
    result = await handle_agent_delegation(
        delegate_decision,
        conv_id,
        content,
        user_id,
        conv_config,
        db,
        config_provider,
        context_manager,
        exec_service,
    )

    result["ephemeral_agent"] = {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
    }
    return result


async def handle_multi_action(
    decision: RoutingDecision,
    conv_id: str,
    content: str,
    user_id: str,
    conv_config: dict[str, Any],
    execute_strategy_fn: ExecuteStrategyFn,
) -> dict[str, Any]:
    """Handle MULTI_ACTION — execute multiple sub-decisions sequentially."""
    results = []
    execution_ids = []
    sub_decisions = decision.sub_decisions or []

    for i, sub in enumerate(sub_decisions):
        try:
            result = await execute_strategy_fn(
                sub,
                conv_id,
                content,
                user_id,
                conv_config,
            )
            results.append(result)
            if result.get("execution_id"):
                execution_ids.append(result["execution_id"])
        except (ValueError, RuntimeError, ConnectionError, TimeoutError, KeyError) as e:
            logger.error(
                "MULTI_ACTION sub-decision %d/%d failed: %s",
                i + 1,
                len(sub_decisions),
                e,
            )
            results.append({"error": str(e)})

    return {
        "results": results,
        "execution_ids": execution_ids,
    }
