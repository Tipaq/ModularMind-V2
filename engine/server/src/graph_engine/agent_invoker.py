"""Dynamic agent invocation utility.

Allows any node to call an agent by ID at runtime,
independent of graph wiring.
"""

import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.types import RunnableConfig

from .interfaces import ConfigProviderProtocol, LLMProviderProtocol
from .state import GraphState

logger = logging.getLogger(__name__)


class AgentInvoker:
    """Invokes agents dynamically by ID.

    This utility enables runtime agent invocation independent of
    graph topology — used by supervisor nodes, loop-over-agents,
    and future tool integrations.
    """

    def __init__(
        self,
        config_provider: ConfigProviderProtocol,
        llm_provider: LLMProviderProtocol,
    ):
        self.config_provider = config_provider
        self.llm_provider = llm_provider

    async def invoke(
        self,
        agent_id: str,
        state: GraphState,
        *,
        override_prompt: str | None = None,
        extra_context: str | None = None,
        context_layers: list[str] | None = None,
        config: RunnableConfig | None = None,
    ) -> dict[str, Any]:
        """Invoke an agent and return its output.

        Args:
            agent_id: UUID string of the agent to call
            state: Current graph state (messages, node_outputs, etc.)
            override_prompt: Optional prompt to use instead of conversation messages
            extra_context: Additional context injected as a system message
            context_layers: Pre-built context strings (memory, RAG) to inject
            config: LangGraph runnable config for callbacks

        Returns:
            Dict with keys: response, model, messages, agent_id, agent_name
        """
        agent = await self.config_provider.get_agent_config(agent_id)
        if not agent:
            raise ValueError(f"Agent '{agent_id}' not found")

        # Build messages
        llm_messages: list[BaseMessage] = [SystemMessage(content=agent.system_prompt)]

        # Inject context layers (memory, RAG) before extra_context
        for _ctx in context_layers or []:
            if _ctx and _ctx.strip():
                llm_messages.append(SystemMessage(content=_ctx))

        if extra_context:
            llm_messages.append(SystemMessage(content=extra_context))

        if override_prompt:
            llm_messages.append(HumanMessage(content=override_prompt))
        else:
            llm_messages.extend(state.get("messages", []))

        # Get LLM and invoke
        llm = await self.llm_provider.get_model(agent.model_id)
        response = await llm.ainvoke(llm_messages, config=config)
        response_text = response.content if hasattr(response, "content") else str(response)

        logger.info("Agent '%s' (%s) responded: %d chars", agent.name, agent_id, len(response_text))

        return {
            "response": response_text,
            "model": agent.model_id,
            "messages": [AIMessage(content=response_text)],
            "agent_id": agent_id,
            "agent_name": agent.name,
        }
