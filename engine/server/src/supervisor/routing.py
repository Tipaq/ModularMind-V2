"""
Routing resolution — determines the routing strategy from message content and context.
"""

import logging
from typing import Any

from src.domain_config.provider import ConfigProvider

from .context_manager import HierarchicalContextManager
from .message_parser import MessageParser
from .schemas import RoutingDecision, RoutingStrategy

logger = logging.getLogger(__name__)


async def resolve_routing(
    conversation_id: str,
    content: str,
    messages: list[dict[str, Any]] | None,
    conv_config: dict[str, Any],
    user_id: str,
    parser: MessageParser,
    context_manager: HierarchicalContextManager,
    config_provider: ConfigProvider,
    get_memory_context_fn,
    get_knowledge_context_fn,
    route_with_llm_fn,
    resolve_model_name_fn,
    state_holder,
) -> RoutingDecision:
    """Determine routing strategy from message content and context.

    Args:
        conversation_id: The conversation ID.
        content: Raw user message.
        messages: Recent conversation messages.
        conv_config: Per-conversation config.
        user_id: The user ID.
        parser: MessageParser instance.
        context_manager: HierarchicalContextManager singleton.
        config_provider: ConfigProvider instance.
        get_memory_context_fn: Async callable to retrieve memory context.
        get_knowledge_context_fn: Async callable to retrieve knowledge context.
        route_with_llm_fn: Async callable for LLM-based routing.
        resolve_model_name_fn: Callable to resolve model name.
        state_holder: Object to store _last_user_profile and _last_knowledge_data.

    Returns:
        RoutingDecision with the chosen strategy.
    """
    parsed, matched_agent_ids = await parser.parse_multi(content)

    if parsed.explicit_graph:
        return RoutingDecision(
            strategy=RoutingStrategy.EXECUTE_GRAPH,
            graph_id=parsed.explicit_graph,
            reasoning="User used /graph: command",
            confidence=1.0,
        )

    if len(matched_agent_ids) > 1:
        sub_decisions = [
            RoutingDecision(
                strategy=RoutingStrategy.DELEGATE_AGENT,
                agent_id=aid,
                reasoning=f"Explicit @mention (multi-action #{i + 1})",
                confidence=1.0,
            )
            for i, aid in enumerate(matched_agent_ids)
        ]
        return RoutingDecision(
            strategy=RoutingStrategy.MULTI_ACTION,
            reasoning=f"Multiple @mentions detected ({len(matched_agent_ids)} agents)",
            confidence=1.0,
            sub_decisions=sub_decisions,
        )

    if parsed.explicit_agent:
        return RoutingDecision(
            strategy=RoutingStrategy.DELEGATE_AGENT,
            agent_id=parsed.explicit_agent,
            reasoning="User used @AgentName mention",
            confidence=1.0,
        )

    # No explicit routing — use LLM with session affinity
    last_agent = await context_manager.get_last_agent(conversation_id)

    # Retrieve user profile for routing context
    memory_context = ""
    state_holder._last_user_profile = None
    if user_id:
        memory_context = await get_memory_context_fn(user_id)
        state_holder._last_user_profile = memory_context or None

    # Retrieve knowledge context from agents' RAG collections
    knowledge_context = ""
    state_holder._last_knowledge_data = None
    knowledge_context, state_holder._last_knowledge_data = await get_knowledge_context_fn(
        content,
        conv_config,
    )

    llm_content = parsed.clean_content
    if parsed.create_directive and parsed.create_instructions:
        llm_content = parsed.create_instructions

    decision = await route_with_llm_fn(
        conversation_id,
        llm_content,
        messages=messages,
        affinity_agent_id=last_agent,
        conv_config=conv_config,
        memory_context=memory_context,
        knowledge_context=knowledge_context,
    )

    if parsed.create_directive:
        decision.strategy = RoutingStrategy.CREATE_AGENT
        decision.confidence = 1.0
        decision.reasoning = f"@create directive (LLM provided config: {decision.reasoning})"
        if not decision.ephemeral_config:
            decision.ephemeral_config = {}
        decision.ephemeral_config.setdefault("name", "Ephemeral Agent")
        decision.ephemeral_config.setdefault("description", parsed.create_instructions or "")
        decision.ephemeral_config.setdefault(
            "system_prompt",
            f"You are a specialized assistant. User requested: {parsed.create_instructions}",
        )
        if "tool_categories" not in decision.ephemeral_config:
            decision.ephemeral_config["tool_categories"] = _infer_tool_categories(
                parsed.create_instructions or "",
            )

    decision = apply_single_selection_override(decision, conv_config)
    return decision


_TOOL_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "shell": ["shell", "command", "exec", "terminal", "bash", "clone", "git"],
    "filesystem": ["file", "filesystem", "read", "write", "edit", "create", "sandbox"],
    "network": ["network", "http", "request", "api", "url", "fetch"],
    "github": ["github", "issue", "pull request", "pr", "repo"],
}


def _infer_tool_categories(instructions: str) -> dict[str, bool]:
    """Infer tool categories from @create instructions as LLM fallback."""
    lower = instructions.lower()
    return {
        category: True
        for category, keywords in _TOOL_CATEGORY_KEYWORDS.items()
        if any(kw in lower for kw in keywords)
    }


def apply_single_selection_override(
    decision: RoutingDecision,
    conv_config: dict[str, Any],
) -> RoutingDecision:
    """Override LLM routing when user pinned a single agent/graph."""
    enabled_agents = conv_config.get("enabled_agents") or []
    enabled_graphs = conv_config.get("enabled_graphs") or []

    if decision.strategy == RoutingStrategy.DELEGATE_AGENT:
        if len(enabled_agents) == 1:
            decision.agent_id = enabled_agents[0]
    elif decision.strategy == RoutingStrategy.EXECUTE_GRAPH and len(enabled_graphs) == 1:
        decision.graph_id = enabled_graphs[0]

    return decision


def build_routing_metadata(decision: RoutingDecision) -> dict[str, Any]:
    """Build metadata dict for trace events."""
    from datetime import UTC, datetime

    return {
        "type": "trace:routing_decision",
        "strategy": decision.strategy.value,
        "reasoning": decision.reasoning,
        "agent_id": decision.agent_id,
        "graph_id": decision.graph_id,
        "confidence": decision.confidence,
        "timestamp": datetime.now(UTC).isoformat(),
    }
