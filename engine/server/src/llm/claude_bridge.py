"""ChatClaudeBridge — LangChain BaseChatModel routed via docker exec.

Uses the Claude Code CLI in the mm-claude-bridge sidecar container
to run inference with any Claude model via the Max subscription.

When tools are bound (bind_tools), transparently upgrades to ChatAnthropic
using the synced OAuth token, since the CLI does not support structured
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


def _resolve_api_key() -> str | None:
    """Resolve Anthropic API key from SecretsStore or environment."""
    try:
        from src.infra.secrets import secrets_store

        key = secrets_store.get("ANTHROPIC_API_KEY")
        if key:
            return key
    except Exception:
        pass
    import os

    return os.environ.get("ANTHROPIC_API_KEY")


class ChatClaudeBridge(BaseChatModel):
    """Chat model that routes through the Claude Code CLI sidecar.

    For simple inference (no tools), uses `claude -p` via docker exec.
    When bind_tools() is called, upgrades to ChatAnthropic for native
    tool_use support using the synced OAuth/API key.
    """

    model_name: str = "claude-sonnet-4-6"

    @property
    def _llm_type(self) -> str:
        return "claude-bridge"

    def bind_tools(
        self,
        tools: Any,
        **kwargs: Any,
    ) -> BaseChatModel:
        """Upgrade to ChatAnthropic for tool calling support.

        The CLI bridge cannot return structured tool_use blocks,
        so we transparently switch to the Anthropic API when tools
        are needed. Uses the OAuth token synced from the bridge.
        """
        api_key = _resolve_api_key()
        if not api_key:
            raise NotImplementedError(
                "ChatClaudeBridge requires ANTHROPIC_API_KEY for tool calling. "
                "Sync credentials via /debug/claude/sync-credentials first."
            )

        from langchain_anthropic import ChatAnthropic

        logger.info(
            "Bridge upgrading to ChatAnthropic for tool calling (%d tools, model=%s)",
            len(tools) if isinstance(tools, list) else 0,
            self.model_name,
        )
        anthropic_llm = ChatAnthropic(
            model=self.model_name,
            api_key=api_key,
            max_tokens=4096,
        )
        return anthropic_llm.bind_tools(tools, **kwargs)

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
