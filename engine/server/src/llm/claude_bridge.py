"""ChatClaudeBridge — LangChain BaseChatModel routed via docker exec.

Uses the Claude Code CLI in the mm-claude-bridge sidecar container
to run inference with any Claude model via the Max subscription.
"""

import asyncio
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.outputs import ChatGeneration, ChatResult

from .bridge_exec import exec_in_bridge

logger = logging.getLogger(__name__)


def _serialize_messages(messages: list[BaseMessage]) -> str:
    parts: list[str] = []
    for msg in messages:
        if isinstance(msg, SystemMessage):
            parts.append(f"System: {msg.content}")
        elif isinstance(msg, HumanMessage):
            parts.append(f"Human: {msg.content}")
        elif isinstance(msg, AIMessage):
            parts.append(f"Assistant: {msg.content}")
        else:
            parts.append(f"Human: {msg.content}")
    return "\n\n".join(parts)


class ChatClaudeBridge(BaseChatModel):
    """Chat model that routes through the Claude Code CLI sidecar."""

    model_name: str = "claude-sonnet-4-6"

    @property
    def _llm_type(self) -> str:
        return "claude-bridge"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = _serialize_messages(messages)
        command = [
            "claude", "-p", prompt,
            "--model", self.model_name,
            "--output-format", "text",
        ]
        output = asyncio.get_event_loop().run_until_complete(
            exec_in_bridge(command)
        )
        return ChatResult(
            generations=[
                ChatGeneration(message=AIMessage(content=output.strip()))
            ]
        )

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = _serialize_messages(messages)
        command = [
            "claude", "-p", prompt,
            "--model", self.model_name,
            "--output-format", "text",
        ]
        output = await exec_in_bridge(command)
        return ChatResult(
            generations=[
                ChatGeneration(message=AIMessage(content=output.strip()))
            ]
        )
