"""ChatClaudeBridge — LangChain BaseChatModel routed via docker exec.

Uses the Claude Code CLI in the mm-claude-bridge sidecar container
to run inference with any Claude model via the Max subscription.

When tools are bound via bind_tools(), the CLI is invoked with
--allowedTools pointing to the internal MCP server, so Claude
autonomously calls ModularMind tools during inference.
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

MCP_SERVER_URL = "http://engine:8000/mcp"


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
    """Chat model routed through Claude Code CLI sidecar.

    Supports tool calling via internal MCP server when bind_tools()
    is called. The CLI manages the full tool loop autonomously.
    """

    model_name: str = "claude-sonnet-4-6"
    _bound_tool_names: list[str] = []
    _mcp_nonce: str = ""
    _execution_context: dict[str, Any] = {}

    class Config:
        underscore_attrs_are_private = True

    @property
    def _llm_type(self) -> str:
        return "claude-bridge"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ChatClaudeBridge":
        """Store tool names for --allowedTools filter. Returns a copy."""
        tool_names: list[str] = []
        if isinstance(tools, list):
            for tool in tools:
                if isinstance(tool, dict):
                    name = tool.get("function", {}).get("name", "")
                    if name:
                        tool_names.append(name)

        new = self.model_copy()
        new._bound_tool_names = tool_names
        logger.info(
            "Bridge bind_tools: %d tools for MCP routing", len(tool_names),
        )
        return new

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        output = asyncio.get_event_loop().run_until_complete(
            self._run_bridge(messages)
        )
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=output))]
        )

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        output = await self._run_bridge(messages)
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=output))]
        )

    async def _run_bridge(self, messages: list[BaseMessage]) -> str:
        """Execute prompt via bridge CLI, with optional MCP tools."""
        prompt = _serialize_messages(messages)
        command = [
            "claude", "-p", prompt,
            "--model", self.model_name,
            "--output-format", "text",
        ]

        if self._bound_tool_names:
            mcp_tool_names = [
                f"mcp__modularmind__{name}" for name in self._bound_tool_names
            ]
            command.extend(["--allowedTools", ",".join(mcp_tool_names)])

        output = await exec_in_bridge(command)
        return output.strip()
