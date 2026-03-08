"""Execution tracing via LangChain callbacks.

Publishes detailed trace events during agent/graph execution
for real-time monitoring through Redis pub/sub → SSE.
"""

import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

from src.infra.metrics import (
    llm_request_duration_seconds,
    llm_tokens_per_second,
    llm_ttft_seconds,
    record_llm_latency,
    record_llm_tps,
    record_llm_ttft,
)

logger = logging.getLogger(__name__)


def _truncate(text: str, max_length: int) -> str:
    """Truncate text with ellipsis if too long."""
    from src.infra.text_utils import truncate
    return truncate(text, max_length)


def _safe_str(value: Any, max_length: int = 500) -> str:
    """Convert value to string safely with truncation."""
    try:
        s = str(value)
    except Exception:  # noqa: BLE001 — must not crash on any repr failure
        s = "<unserializable>"
    return _truncate(s, max_length)


def _extract_model_name(
    serialized: dict[str, Any],
    kwargs: dict[str, Any] | None = None,
) -> str:
    """Extract a human-readable model name from LangChain serialized data.

    Tries multiple locations where different providers store the model name,
    and prefixes with provider when available.
    """
    kw = serialized.get("kwargs", {})
    model = (
        kw.get("model")
        or kw.get("model_name")
        or kw.get("model_id")
    )

    # LangChain passes invocation_params in callback kwargs
    if not model and kwargs:
        inv = kwargs.get("invocation_params") or {}
        model = inv.get("model") or inv.get("model_name") or ""

    # Some providers (e.g. ChatOllama) are not lc_serializable, so kwargs
    # is empty. The model name is only available in the "repr" field:
    # e.g. "ChatOllama(model='llama3.2', base_url='http://...')"
    if not model:
        repr_str = serialized.get("repr", "")
        if repr_str:
            # Extract model name from repr: model='llama3.2' or model="gpt-4"
            m = re.search(r"model=['\"]([^'\"]+)['\"]", repr_str)
            if m:
                model = m.group(1)

    # Derive provider prefix from serialized id
    # e.g. ["langchain_ollama", "chat_models", "ChatOllama"] → "ollama"
    id_parts = serialized.get("id", [])
    provider = ""
    if id_parts:
        raw_provider = id_parts[0]  # e.g. "langchain_ollama"
        provider = raw_provider.replace("langchain_", "").replace("langchain-", "")

    if not model:
        # Last resort: class name from id
        model = id_parts[-1] if id_parts else "unknown"

    # Format as "provider:model" if we have a provider and the model isn't
    # already prefixed (e.g. avoid "ollama:ollama:llama3.2")
    if provider and not model.startswith(provider):
        return f"{provider}:{model}"
    return model


def _split_model_provider(model_str: str) -> tuple[str, str]:
    """Split 'provider:model' string into (provider, model_name) tuple."""
    if ":" in model_str:
        provider, model_name = model_str.split(":", 1)
        return provider, model_name
    return "unknown", model_str


def _extract_response_preview(
    response: LLMResult, max_length: int,
) -> str | None:
    """Extract a text preview from the first generation in an LLM response."""
    if not response.generations:
        return None
    gen = response.generations[0]
    if not gen:
        return None
    text = gen[0].text if gen[0].text else ""
    if not text and hasattr(gen[0], "message"):
        text = str(gen[0].message.content)
    return _truncate(text, max_length) if text else None


def _extract_token_usage(
    response: LLMResult,
    prompt_text: str,
) -> tuple[int, int, bool]:
    """Extract token usage from LLM response, trying multiple provider formats.

    Returns:
        (prompt_tokens, completion_tokens, estimated) — estimated=True when
        no provider metadata was available and tiktoken was used.
    """
    # Path 1: llm_output["token_usage"] (OpenAI, Anthropic)
    if response.llm_output and "token_usage" in response.llm_output:
        usage = response.llm_output["token_usage"]
        return usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), False

    gen = response.generations[0][0] if response.generations and response.generations[0] else None
    if gen:
        # Path 2: generation_info["token_usage"]
        if hasattr(gen, "generation_info") and gen.generation_info:
            if "token_usage" in gen.generation_info:
                usage = gen.generation_info["token_usage"]
                return usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), False

        # Path 3: AIMessage.usage_metadata (LangChain v0.2+)
        msg = getattr(gen, "message", None)
        if msg and hasattr(msg, "usage_metadata") and msg.usage_metadata:
            um = msg.usage_metadata
            return um.get("input_tokens", 0), um.get("output_tokens", 0), False

    # Path 4: tiktoken fallback — estimate when no provider metadata
    try:
        from src.infra.token_counter import count_tokens

        p_tok = count_tokens(prompt_text) if prompt_text else 0
        c_tok = 0
        if gen:
            resp_text = gen.text or ""
            if not resp_text and hasattr(gen, "message"):
                resp_text = str(gen.message.content)
            if resp_text:
                c_tok = count_tokens(resp_text)
        if p_tok or c_tok:
            return p_tok, c_tok, True
    except (ValueError, TypeError, AttributeError):
        logger.debug("tiktoken fallback failed", exc_info=True)

    return 0, 0, False


@dataclass
class _RunContext:
    """Per-run state tracked during LLM execution."""

    start_time: float
    provider: str = "unknown"
    model: str = "unknown"
    prompt_text: str = ""
    first_token_time: float | None = None


@dataclass
class TokenAccumulator:
    """Thread-safe accumulator for token counts across LLM calls."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, prompt: int, completion: int) -> None:
        with self._lock:
            self.prompt_tokens += prompt
            self.completion_tokens += completion

    @property
    def total(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class ExecutionTraceHandler(BaseCallbackHandler):
    """LangChain callback handler that publishes execution trace events.

    Each callback method publishes a structured event dict via the
    provided publish_fn. Events are used for real-time monitoring
    in the dashboard.

    All callback methods are wrapped in try/except to ensure tracing
    never breaks the actual execution.
    """

    def __init__(
        self,
        execution_id: str,
        publish_fn: Callable[[dict[str, Any]], None],
        *,
        max_content_length: int = 500,
        log_prompts: bool = False,
    ):
        """Initialize trace handler.

        Args:
            execution_id: ID of the current execution
            publish_fn: Function to publish trace events (receives event dict)
            max_content_length: Max chars for content previews
            log_prompts: If True, include full prompt content (privacy risk)
        """
        super().__init__()
        self.execution_id = execution_id
        self.publish_fn = publish_fn
        self.max_content_length = max_content_length
        self.log_prompts = log_prompts

        # Accumulated token counts (read after execution completes)
        self.tokens = TokenAccumulator()

        # Per-run context (timing, model info, prompt text)
        self._runs: dict[UUID, _RunContext] = {}

    def _publish(self, event: dict[str, Any]) -> None:
        """Publish a trace event, never raising."""
        try:
            event.setdefault("timestamp", datetime.now(UTC).isoformat())
            event.setdefault("execution_id", self.execution_id)
            self.publish_fn(event)
        except Exception:  # noqa: BLE001 — callback must never crash LLM execution
            logger.debug("Failed to publish trace event", exc_info=True)

    def _start_run(self, run_id: UUID, provider: str = "unknown", model: str = "unknown") -> _RunContext:
        ctx = _RunContext(start_time=time.perf_counter(), provider=provider, model=model)
        self._runs[run_id] = ctx
        return ctx

    def _end_run(self, run_id: UUID) -> tuple[_RunContext | None, int | None]:
        """Pop run context and return (context, elapsed_ms)."""
        ctx = self._runs.pop(run_id, None)
        if ctx is None:
            return None, None
        elapsed = int((time.perf_counter() - ctx.start_time) * 1000)
        return ctx, elapsed

    # ------------------------------------------------------------------
    # LLM callbacks
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            model = _extract_model_name(serialized, kwargs)
            provider, model_name = _split_model_provider(model)

            ctx = self._start_run(run_id, provider, model_name)
            if prompts:
                ctx.prompt_text = "\n".join(prompts)

            event: dict[str, Any] = {
                "type": "trace:llm_start",
                "model": model,
                "prompt_count": len(prompts),
            }
            if self.log_prompts and prompts:
                event["prompt_preview"] = _safe_str(
                    prompts[0], self.max_content_length
                )
            self._publish(event)
        except Exception:  # noqa: BLE001 — callback must never crash LLM execution
            logger.debug("on_llm_start trace error", exc_info=True)

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[BaseMessage]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called for chat models (ChatOpenAI, ChatAnthropic, etc.)."""
        try:
            model = _extract_model_name(serialized, kwargs)
            provider, model_name = _split_model_provider(model)

            ctx = self._start_run(run_id, provider, model_name)
            flat_messages = messages[0] if messages else []

            prompt_text = " ".join(
                str(m.content) for m in flat_messages if m.content
            )
            if prompt_text:
                ctx.prompt_text = prompt_text
            message_count = len(flat_messages)

            event: dict[str, Any] = {
                "type": "trace:llm_start",
                "model": model,
                "message_count": message_count,
            }

            if self.log_prompts and flat_messages:
                # Show last user message as preview
                last_human = next(
                    (m for m in reversed(flat_messages) if m.type == "human"),
                    flat_messages[-1],
                )
                event["prompt_preview"] = _safe_str(
                    last_human.content, self.max_content_length
                )

            # Summarize message types
            type_counts: dict[str, int] = {}
            for m in flat_messages:
                type_counts[m.type] = type_counts.get(m.type, 0) + 1
            event["message_types"] = type_counts

            self._publish(event)
        except Exception:  # noqa: BLE001 — callback must never crash LLM execution
            logger.debug("on_chat_model_start trace error", exc_info=True)

    def on_llm_new_token(
        self,
        token: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Record TTFT on first token arrival (streaming calls only)."""
        try:
            ctx = self._runs.get(run_id)
            if ctx and ctx.first_token_time is None:
                ctx.first_token_time = time.perf_counter()
                ttft = ctx.first_token_time - ctx.start_time
                llm_ttft_seconds.labels(provider=ctx.provider, model=ctx.model).observe(ttft)
                record_llm_ttft(ttft)
        except Exception:
            logger.debug("on_llm_new_token trace error", exc_info=True)

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            ctx, duration_ms = self._end_run(run_id)
            provider = ctx.provider if ctx else "unknown"
            model = ctx.model if ctx else "unknown"

            duration_seconds = duration_ms / 1000.0 if duration_ms is not None else None
            if duration_seconds is not None:
                llm_request_duration_seconds.labels(provider=provider, model=model).observe(duration_seconds)
                record_llm_latency(duration_seconds)

            event: dict[str, Any] = {
                "type": "trace:llm_end",
                "duration_ms": duration_ms,
            }

            # Extract token usage (tries provider metadata, then tiktoken fallback)
            prompt_tok, completion_tok, estimated = _extract_token_usage(
                response, ctx.prompt_text if ctx else "",
            )
            if prompt_tok or completion_tok:
                event["tokens"] = {
                    "prompt": prompt_tok,
                    "completion": completion_tok,
                    "total": prompt_tok + completion_tok,
                }
                if estimated:
                    event["tokens_estimated"] = True
                self.tokens.add(prompt_tok, completion_tok)

            # Tokens/sec calculation
            total_tokens = prompt_tok + completion_tok
            if total_tokens > 0 and duration_seconds and duration_seconds > 0:
                tps = total_tokens / duration_seconds
                llm_tokens_per_second.labels(provider=provider, model=model).observe(tps)
                record_llm_tps(tps)

            preview = _extract_response_preview(response, self.max_content_length)
            if preview:
                event["response_preview"] = preview

            self._publish(event)
        except Exception:
            logger.debug("on_llm_end trace error", exc_info=True)

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            self._publish({
                "type": "trace:error",
                "error": _safe_str(error, self.max_content_length),
                "error_type": type(error).__name__,
                "step": "llm",
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_llm_error trace error", exc_info=True)

    # ------------------------------------------------------------------
    # Chain / node callbacks
    # ------------------------------------------------------------------

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            if serialized is None:
                return
            name = serialized.get("name", "")
            if not name:
                id_parts = serialized.get("id", [])
                name = id_parts[-1] if id_parts else "unknown"

            # Only publish for meaningful chains (skip internal LangGraph plumbing)
            if name in ("RunnableSequence", "RunnableLambda", "ChannelWrite", "ChannelRead"):
                return

            self._start_run(run_id)
            self._publish({
                "type": "trace:node_start",
                "node_name": name,
                "tags": tags or [],
            })
        except Exception:
            logger.debug("on_chain_start trace error", exc_info=True)

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            if duration_ms is None:
                # Was filtered out in on_chain_start
                return

            self._publish({
                "type": "trace:node_end",
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_chain_end trace error", exc_info=True)

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            self._publish({
                "type": "trace:error",
                "error": _safe_str(error, self.max_content_length),
                "error_type": type(error).__name__,
                "step": "chain",
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_chain_error trace error", exc_info=True)

    # ------------------------------------------------------------------
    # Tool callbacks
    # ------------------------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            self._start_run(run_id)
            tool_name = serialized.get("name", "unknown")

            self._publish({
                "type": "trace:tool_start",
                "tool_name": tool_name,
                "input_preview": _safe_str(input_str, self.max_content_length),
            })
        except Exception:
            logger.debug("on_tool_start trace error", exc_info=True)

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            self._publish({
                "type": "trace:tool_end",
                "output_preview": _safe_str(output, self.max_content_length),
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_tool_end trace error", exc_info=True)

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            self._publish({
                "type": "trace:error",
                "error": _safe_str(error, self.max_content_length),
                "error_type": type(error).__name__,
                "step": "tool",
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_tool_error trace error", exc_info=True)

    # ------------------------------------------------------------------
    # Retriever callbacks
    # ------------------------------------------------------------------

    def on_retriever_start(
        self,
        serialized: dict[str, Any],
        query: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            self._start_run(run_id)
            self._publish({
                "type": "trace:retrieval",
                "query": _truncate(query, self.max_content_length),
                "status": "started",
            })
        except Exception:
            logger.debug("on_retriever_start trace error", exc_info=True)

    def on_retriever_end(
        self,
        documents: list[Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        try:
            _, duration_ms = self._end_run(run_id)
            self._publish({
                "type": "trace:retrieval",
                "status": "completed",
                "num_results": len(documents),
                "duration_ms": duration_ms,
            })
        except Exception:
            logger.debug("on_retriever_end trace error", exc_info=True)

