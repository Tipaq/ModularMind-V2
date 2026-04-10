"""
LLM-based routing — calls the supervisor LLM to determine routing strategy.
"""

import logging
from typing import Any

import httpx
from langchain_core.messages import HumanMessage
from pydantic import ValidationError

from src.domain_config.provider import ConfigProvider
from src.llm.base import LLMProvider
from src.llm.errors import ExecutionError, ExecutionErrorCode

from .prompts import build_routing_task_prompt
from .schemas import RoutingDecision, RoutingStrategy

logger = logging.getLogger(__name__)

ROUTING_TEMPERATURE = 0.1


async def route_with_llm(
    conversation_id: str,
    content: str,
    config_provider: ConfigProvider,
    llm_provider: LLMProvider,
    resolve_model_name_fn,
    conv_config: dict[str, Any] | None = None,
    messages: list[dict[str, Any]] | None = None,
    affinity_agent_id: str | None = None,
    memory_context: str = "",
    knowledge_context: str = "",
    user_id: str = "",
) -> RoutingDecision:
    """Call supervisor LLM for routing decision."""
    conv_config = conv_config or {}
    try:
        task_prompt = await build_routing_prompt(
            config_provider,
            messages,
            affinity_agent_id,
            conv_config,
            memory_context=memory_context,
            knowledge_context=knowledge_context,
            user_id=user_id,
        )
        llm_messages = compose_routing_messages(conv_config, task_prompt)

        _, model_name = resolve_model_name_fn(conv_config)
        llm = await llm_provider.get_model(
            model_name,
            temperature=ROUTING_TEMPERATURE,
            format="json",
        )
        response = await llm.ainvoke(llm_messages + [HumanMessage(content=content)])

        return parse_routing_response(response)

    except ExecutionError as err:
        if err.code in (
            ExecutionErrorCode.AUTH_FAILED,
            ExecutionErrorCode.PERMISSION_DENIED,
        ):
            raise
        logger.error("LLM routing failed: %s", err.user_message)
        return RoutingDecision(
            strategy=RoutingStrategy.DIRECT_RESPONSE,
            reasoning=f"Routing failed: {err.user_message}",
            confidence=0.0,
        )
    except (
        httpx.HTTPError,
        ConnectionError,
        TimeoutError,
        ValidationError,
        ValueError,
        RuntimeError,
        KeyError,
    ) as e:
        logger.error("LLM routing failed: %s", e, exc_info=True)
        return RoutingDecision(
            strategy=RoutingStrategy.DIRECT_RESPONSE,
            reasoning=f"Routing failed: {e}",
            confidence=0.0,
        )


async def build_routing_prompt(
    config_provider: ConfigProvider,
    messages: list[dict[str, Any]] | None,
    affinity_agent_id: str | None,
    conv_config: dict[str, Any],
    memory_context: str = "",
    knowledge_context: str = "",
    user_id: str = "",
) -> str:
    """Build the routing task prompt with agent/graph catalog and MCP tools."""
    agents = await config_provider.list_agents()
    graphs = await config_provider.list_graphs()

    if enabled_agents := conv_config.get("enabled_agents"):
        agents = [a for a in agents if a.id in enabled_agents]
    if enabled_graphs := conv_config.get("enabled_graphs"):
        graphs = [g for g in graphs if g.id in enabled_graphs]

    last_agent_info = None
    if affinity_agent_id:
        agent = await config_provider.get_agent_config(affinity_agent_id)
        if agent:
            last_agent_info = f"{agent.name} (id={agent.id})"

    mcp_tools = await discover_mcp_tools_for_routing(conv_config)

    if user_id:
        connector_tools = await _discover_connector_tools_for_routing(
            user_id
        )
        if connector_tools:
            mcp_tools = mcp_tools or {}
            mcp_tools["User Connectors"] = connector_tools

    allowed_tool_categories = conv_config.get("supervisor_tool_categories")

    return build_routing_task_prompt(
        agents=agents,
        graphs=graphs,
        history=messages or [],
        last_agent=last_agent_info,
        mcp_tools=mcp_tools,
        memory_context=memory_context,
        knowledge_context=knowledge_context,
        allowed_tool_categories=allowed_tool_categories,
    )


async def discover_mcp_tools_for_routing(
    conv_config: dict[str, Any],
) -> dict[str, Any] | None:
    """Discover MCP tools to include in routing context."""
    try:
        from src.mcp.service import get_mcp_registry

        registry = get_mcp_registry()
        enabled_servers = [s for s in registry.list_servers() if s.enabled]
        if not enabled_servers:
            return None
        tools_map: dict[str, Any] = {}
        for server in enabled_servers:
            try:
                tools = await registry.discover_tools(server.id)
                if tools:
                    tools_map[server.name] = tools
            except (ConnectionError, TimeoutError, OSError, RuntimeError):
                logger.debug(
                    "MCP tool discovery failed for server %s",
                    server.name,
                    exc_info=True,
                )
        return tools_map or None
    except (ImportError, ConnectionError, TimeoutError, OSError, RuntimeError) as e:
        logger.debug("MCP tool discovery for routing failed: %s", e)
        return None


async def _discover_connector_tools_for_routing(
    user_id: str,
) -> list[Any] | None:
    """Discover user's outbound connector tools for routing context."""
    try:
        from src.infra.database import async_session_maker
        from src.tools.registry import resolve_connector_tool_definitions

        defs, _ = await resolve_connector_tool_definitions(
            user_id, [], async_session_maker
        )
        if not defs:
            return None
        return [
            type(
                "ConnectorTool",
                (),
                {
                    "name": d["function"]["name"],
                    "description": d["function"]["description"],
                },
            )()
            for d in defs
        ]
    except (ImportError, ConnectionError, OSError, RuntimeError) as e:
        logger.debug("Connector tool discovery for routing failed: %s", e)
        return None


def compose_routing_messages(
    conv_config: dict[str, Any],
    task_prompt: str,
) -> list[Any]:
    """Compose layered LLM messages for routing (identity + task)."""
    from src.prompt_layers import (
        LayerType,
        PromptComposer,
        PromptLayer,
        get_supervisor_identity,
    )

    composer = PromptComposer()
    composer.add(
        PromptLayer(LayerType.IDENTITY, get_supervisor_identity(), "supervisor_identity")
    )
    composer.add(PromptLayer(LayerType.TASK, task_prompt, "routing_task"))
    return composer.build()


def parse_routing_response(response) -> RoutingDecision:
    """Parse LLM response into a RoutingDecision."""
    response_text = (
        response.content if isinstance(response.content, str) else str(response.content)
    )
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        cleaned = "\n".join(lines)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start : end + 1]

    return RoutingDecision.model_validate_json(cleaned)
