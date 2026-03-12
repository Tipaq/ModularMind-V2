"""Shared tool-calling loop for LLM + MCP tool execution.

Implements a ReAct-style agentic loop used by both the supervisor
(TOOL_RESPONSE strategy) and agent execution (worker tasks).

Flow:
  1. Call LLM with messages (tools already bound via ``bind_tools()``)
  2. If response has ``tool_calls`` → execute each tool → append ToolMessage → goto 1
  3. If response is text only → return final response
  4. If ``max_iterations`` reached → return last response
"""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

logger = logging.getLogger(__name__)


class ToolExecutor(Protocol):
    """Protocol for tool executors (MCP, built-in, or unified)."""

    async def execute(self, name: str, args: dict[str, Any]) -> str: ...


async def run_tool_loop(
    llm: BaseChatModel,
    messages: list[BaseMessage],
    tool_executor: ToolExecutor,
    *,
    max_iterations: int = 10,
    tool_call_timeout: float = 60.0,
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    cancel_check_fn: Callable[[], Awaitable[bool]] | None = None,
    min_tool_calls: int = 0,
    reflection_prompt: str | None = None,
) -> tuple[str, list[BaseMessage]]:
    """Run an LLM tool-calling loop until completion or max iterations.

    The ``llm`` must already have tools bound via ``bind_tools()``.

    Args:
        llm: LangChain chat model with tools bound.
        messages: Initial message list (system + history + user message).
        tool_executor: Executor for dispatching tool calls to MCP servers.
        max_iterations: Safety limit for the number of LLM round-trips.
        tool_call_timeout: Timeout in seconds for each individual tool call.
        publish_fn: Optional async callback to publish trace events
            (``trace:tool_start``, ``trace:tool_end``).
        cancel_check_fn: Optional async callback that returns True if
            the execution has been cancelled. Checked before each LLM
            call and before each tool call.
        min_tool_calls: Minimum number of tool calls before the loop can
            exit with a text response. If the model tries to respond with
            text before reaching this threshold, a reflection message is
            injected to push it to use more tools.
        reflection_prompt: Custom message injected when min_tool_calls is
            not yet met. Defaults to a generic "search more" nudge.

    Returns:
        Tuple of ``(final_text_response, full_message_history)``.
    """
    # Work on a copy to avoid mutating the caller's list
    msgs = list(messages)
    total_tool_calls = 0
    reflections_sent = 0
    max_reflections = 2  # Safety cap to avoid infinite reflection loops

    for iteration in range(max_iterations):
        # Check for cancellation before each LLM call
        if cancel_check_fn and await cancel_check_fn():
            from src.executions.cancel import ExecutionCancelled

            raise ExecutionCancelled()

        logger.info(
            "Tool loop iteration %d/%d (messages=%d)", iteration + 1, max_iterations, len(msgs)
        )
        response: AIMessage = await llm.ainvoke(msgs)
        msgs.append(response)

        # Debug: log raw response details for tool-calling diagnostics
        _raw_tc = getattr(response, "tool_calls", None)
        _raw_invalid = getattr(response, "invalid_tool_calls", None)
        _content_preview = (response.content or "")[:300] if response.content else "(empty)"
        logger.info(
            "LLM raw response: content_len=%d, tool_calls=%s, "
            "invalid_tool_calls=%s, additional_keys=%s, content_preview=%s",
            len(response.content) if response.content else 0,
            _raw_tc[:3] if _raw_tc else _raw_tc,
            _raw_invalid[:3] if _raw_invalid else _raw_invalid,
            list((response.additional_kwargs or {}).keys()),
            _content_preview,
        )

        tool_calls = getattr(response, "tool_calls", None)
        if not tool_calls:
            # No tool calls — check if we need more tool usage
            if (
                min_tool_calls > 0
                and total_tool_calls < min_tool_calls
                and reflections_sent < max_reflections
            ):
                nudge = reflection_prompt or (
                    "You have only used your tools "
                    f"{total_tool_calls} time(s) so far. "
                    f"Please perform at least {min_tool_calls - total_tool_calls} more "
                    "search(es) with different keywords or angles to ensure comprehensive "
                    "coverage before giving your final answer."
                )
                logger.info(
                    "Reflection nudge: %d/%d tool calls, injecting prompt",
                    total_tool_calls,
                    min_tool_calls,
                )
                msgs.append(HumanMessage(content=nudge))
                reflections_sent += 1
                continue

            # Final text response
            text = response.content if isinstance(response.content, str) else str(response.content)
            logger.info(
                "Tool loop completed after %d iteration(s), %d tool call(s), response length=%d",
                iteration + 1,
                total_tool_calls,
                len(text),
            )
            return text, msgs

        # Execute each tool call sequentially
        total_tool_calls += len(tool_calls)
        for call in tool_calls:
            # Check for cancellation before each tool call
            if cancel_check_fn and await cancel_check_fn():
                from src.executions.cancel import ExecutionCancelled

                raise ExecutionCancelled()

            tool_name: str = call.get("name", call.get("function", {}).get("name", "unknown"))
            tool_args: dict = call.get("args", {})
            call_id: str = call.get("id", f"call_{iteration}")

            # Publish tool start
            if publish_fn:
                await _publish_safe(
                    publish_fn,
                    {
                        "type": "trace:tool_start",
                        "tool_name": tool_name,
                        "input_preview": _truncate(
                            json.dumps(tool_args, default=str, ensure_ascii=False),
                            200,
                        ),
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                )

            logger.info(
                "Tool call [%d]: %s(%s)",
                iteration + 1,
                tool_name,
                _truncate(json.dumps(tool_args, default=str), 100),
            )
            start = time.perf_counter()
            try:
                result_text = await asyncio.wait_for(
                    tool_executor.execute(tool_name, tool_args),
                    timeout=tool_call_timeout,
                )
            except TimeoutError:
                logger.warning("Tool '%s' timed out after %.1fs", tool_name, tool_call_timeout)
                result_text = f"Tool error: '{tool_name}' timed out after {tool_call_timeout:.0f}s"
            except Exception as e:  # MCP tool calls raise heterogeneous errors
                logger.warning("Tool '%s' failed: %s", tool_name, e)
                result_text = f"Tool error: {e}"

            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                "Tool result [%d]: %s -> %dms, %d chars",
                iteration + 1,
                tool_name,
                duration_ms,
                len(result_text),
            )

            # Publish tool end
            if publish_fn:
                await _publish_safe(
                    publish_fn,
                    {
                        "type": "trace:tool_end",
                        "tool_name": tool_name,
                        "output_preview": _truncate(result_text, 300),
                        "duration_ms": duration_ms,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                )

            msgs.append(ToolMessage(content=result_text, tool_call_id=call_id))

    # Max iterations reached — return the last AI message content
    logger.warning("Tool loop reached max_iterations=%d", max_iterations)
    last_content = ""
    for msg in reversed(msgs):
        if isinstance(msg, AIMessage) and msg.content:
            last_content = msg.content if isinstance(msg.content, str) else str(msg.content)
            break
    return last_content, msgs


def try_bind_tools(
    llm: BaseChatModel,
    tools: list[dict[str, Any]],
) -> tuple[BaseChatModel, bool]:
    """Attempt to bind tools to an LLM model.

    Returns ``(model_with_tools, True)`` on success, or
    ``(original_model, False)`` if the model doesn't support tool calling.
    """
    if not tools:
        return llm, False
    try:
        bound = llm.bind_tools(tools)
        return bound, True
    except (NotImplementedError, TypeError, ValueError, AttributeError) as e:
        logger.warning(
            "Model does not support tool calling (%s: %s), proceeding without tools",
            type(e).__name__,
            e,
        )
        return llm, False


def _truncate(text: str, max_length: int) -> str:
    """Truncate text with ellipsis."""
    from src.infra.text_utils import truncate

    return truncate(text, max_length)


async def _publish_safe(
    publish_fn: Callable[[dict[str, Any]], Awaitable[None]],
    event: dict[str, Any],
) -> None:
    """Publish a trace event, swallowing errors."""
    try:
        await publish_fn(event)
    except Exception:  # Fire-and-forget: swallow all publish errors
        logger.debug("Failed to publish tool trace event", exc_info=True)
