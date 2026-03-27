"""ChatClaudeBridge — LangChain BaseChatModel routed via docker exec.

Uses the Claude Code CLI in the mm-claude-bridge sidecar container
to run inference with any Claude model via the Max subscription.

When tools are bound (bind_tools), transparently upgrades to ChatAnthropic
using OAuth token or API key, since the CLI does not support structured
tool_use responses.
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
    """Chat model that routes through the Claude Code CLI sidecar.

    For simple inference (no tools), uses `claude -p` via docker exec.
    When bind_tools() is called, upgrades to ChatAnthropic for native
    tool_use support.
    """

    model_name: str = "claude-sonnet-4-6"

    @property
    def _llm_type(self) -> str:
        return "claude-bridge"

    def bind_tools(self, tools: Any, **kwargs: Any) -> BaseChatModel:
        """Upgrade to ChatAnthropic for tool calling support."""
        from langchain_anthropic import ChatAnthropic

        from src.infra.config import get_settings

        from .anthropic import _read_oauth_token

        tool_count = len(tools) if isinstance(tools, list) else 0

        # 1. Try OAuth token
        claude_home = get_settings().CLAUDE_HOME
        oauth_token = _read_oauth_token(claude_home) if claude_home else None

        if oauth_token:
            logger.info(
                "Bridge bind_tools: upgrading via OAuth (%d tools)", tool_count,
            )
            llm = ChatAnthropic(
                model=self.model_name,
                api_key="placeholder",
                default_headers={"Authorization": f"Bearer {oauth_token}"},
                max_tokens=4096,
            )
            return llm.bind_tools(tools, **kwargs)

        # 2. Try API key
        from src.infra.secrets import secrets_store

        api_key = secrets_store.get("ANTHROPIC_API_KEY")
        if not api_key:
            import os

            api_key = os.environ.get("ANTHROPIC_API_KEY")

        if api_key:
            logger.info(
                "Bridge bind_tools: upgrading via API key (%d tools)", tool_count,
            )
            llm = ChatAnthropic(
                model=self.model_name,
                api_key=api_key,
                max_tokens=4096,
            )
            return llm.bind_tools(tools, **kwargs)

        raise NotImplementedError(
            "ChatClaudeBridge requires CLAUDE_HOME or ANTHROPIC_API_KEY for tool calling."
        )

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
