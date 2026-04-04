from enum import StrEnum
from typing import Any

import httpx


class ExecutionErrorCode(StrEnum):
    RATE_LIMITED = "rate_limited"
    AUTH_FAILED = "auth_failed"
    PERMISSION_DENIED = "permission_denied"
    TIMEOUT = "timeout"
    CONNECTION_FAILED = "connection_failed"
    MODEL_NOT_FOUND = "model_not_found"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    TOOL_FAILED = "tool_failed"
    TOOL_TIMEOUT = "tool_timeout"
    MCP_CONNECTION_FAILED = "mcp_connection_failed"
    MCP_TOOL_ERROR = "mcp_tool_error"
    GRAPH_ERROR = "graph_error"
    PROVIDER_ERROR = "provider_error"


PROVIDER_DISPLAY_NAMES: dict[str, str] = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google Gemini",
    "mistral": "Mistral",
    "cohere": "Cohere",
    "groq": "Groq",
    "ollama": "Ollama",
    "vllm": "vLLM",
    "tgi": "TGI",
}

_RETRYABLE_CODES = frozenset({
    ExecutionErrorCode.RATE_LIMITED,
    ExecutionErrorCode.TIMEOUT,
    ExecutionErrorCode.CONNECTION_FAILED,
    ExecutionErrorCode.PROVIDER_UNAVAILABLE,
    ExecutionErrorCode.TOOL_TIMEOUT,
    ExecutionErrorCode.MCP_CONNECTION_FAILED,
})

_USER_MESSAGES: dict[ExecutionErrorCode, str] = {
    ExecutionErrorCode.RATE_LIMITED: "{provider} rate limit exceeded — please wait and retry",
    ExecutionErrorCode.AUTH_FAILED: "{provider} API key is invalid — check Settings > Providers",
    ExecutionErrorCode.PERMISSION_DENIED: (
        "{provider} permission denied — verify API key permissions"
    ),
    ExecutionErrorCode.TIMEOUT: (
        "{provider} request timed out — retry or try a different model"
    ),
    ExecutionErrorCode.CONNECTION_FAILED: (
        "{provider} is not reachable — check your connection"
    ),
    ExecutionErrorCode.MODEL_NOT_FOUND: "{provider} model '{model}' not found",
    ExecutionErrorCode.PROVIDER_UNAVAILABLE: (
        "{provider} is not reachable — check that the service is running"
    ),
    ExecutionErrorCode.TOOL_FAILED: "Tool '{model}' failed — {detail}",
    ExecutionErrorCode.TOOL_TIMEOUT: "Tool '{model}' timed out",
    ExecutionErrorCode.MCP_CONNECTION_FAILED: (
        "MCP server '{provider}' is not reachable"
    ),
    ExecutionErrorCode.MCP_TOOL_ERROR: "MCP tool '{model}' error — {detail}",
    ExecutionErrorCode.GRAPH_ERROR: "Graph execution error — {detail}",
    ExecutionErrorCode.PROVIDER_ERROR: (
        "{provider} returned an error — retry or try a different model"
    ),
}


class ExecutionError(Exception):
    def __init__(
        self,
        code: ExecutionErrorCode,
        provider: str,
        *,
        model: str | None = None,
        is_retryable: bool | None = None,
        retry_after: float | None = None,
        detail: str = "",
    ):
        self.code = code
        self.provider = provider
        self.model = model or ""
        self.is_retryable = is_retryable if is_retryable is not None else code in _RETRYABLE_CODES
        self.retry_after = retry_after
        self.detail = detail
        self.user_message = _build_user_message(code, provider, self.model, detail)
        super().__init__(self.user_message)


def _build_user_message(
    code: ExecutionErrorCode,
    provider: str,
    model: str,
    detail: str,
) -> str:
    template = _USER_MESSAGES.get(code, "{provider} error — {detail}")
    return template.format(provider=provider, model=model, detail=detail or "unknown error")


def _display_name(provider_key: str) -> str:
    return PROVIDER_DISPLAY_NAMES.get(provider_key, provider_key.capitalize())


def _extract_provider_key(model_id: str) -> str:
    if ":" in model_id:
        return model_id.split(":", 1)[0].lower()
    return ""


def classify_llm_error(exc: Exception, provider_key: str, model: str) -> ExecutionError:
    provider = _display_name(provider_key)

    matched = _match_openai_error(exc, provider, model)
    if matched:
        return matched

    matched = _match_anthropic_error(exc, provider, model)
    if matched:
        return matched

    matched = _match_httpx_error(exc, provider, model)
    if matched:
        return matched

    return _match_connection_error(exc, provider, model)


def _match_openai_error(
    exc: Exception, provider: str, model: str,
) -> ExecutionError | None:
    try:
        import openai
    except ImportError:
        return None

    if isinstance(exc, openai.RateLimitError):
        retry_after = _extract_retry_after(exc)
        return ExecutionError(
            ExecutionErrorCode.RATE_LIMITED, provider, model=model, retry_after=retry_after,
        )
    if isinstance(exc, openai.AuthenticationError):
        return ExecutionError(ExecutionErrorCode.AUTH_FAILED, provider, model=model)
    if isinstance(exc, openai.PermissionDeniedError):
        return ExecutionError(ExecutionErrorCode.PERMISSION_DENIED, provider, model=model)
    if isinstance(exc, openai.APITimeoutError):
        return ExecutionError(ExecutionErrorCode.TIMEOUT, provider, model=model)
    if isinstance(exc, openai.APIConnectionError):
        return ExecutionError(ExecutionErrorCode.CONNECTION_FAILED, provider, model=model)
    if isinstance(exc, openai.NotFoundError):
        return ExecutionError(
            ExecutionErrorCode.MODEL_NOT_FOUND, provider, model=model, detail=str(exc),
        )
    if isinstance(exc, openai.APIStatusError):
        return _from_status_code(exc.status_code, provider, model, str(exc))
    return None


def _match_anthropic_error(
    exc: Exception, provider: str, model: str,
) -> ExecutionError | None:
    try:
        import anthropic
    except ImportError:
        return None

    if isinstance(exc, anthropic.RateLimitError):
        retry_after = _extract_retry_after(exc)
        return ExecutionError(
            ExecutionErrorCode.RATE_LIMITED, provider, model=model, retry_after=retry_after,
        )
    if isinstance(exc, anthropic.AuthenticationError):
        return ExecutionError(ExecutionErrorCode.AUTH_FAILED, provider, model=model)
    if isinstance(exc, anthropic.PermissionDeniedError):
        return ExecutionError(ExecutionErrorCode.PERMISSION_DENIED, provider, model=model)
    if isinstance(exc, anthropic.APITimeoutError):
        return ExecutionError(ExecutionErrorCode.TIMEOUT, provider, model=model)
    if isinstance(exc, anthropic.APIConnectionError):
        return ExecutionError(ExecutionErrorCode.CONNECTION_FAILED, provider, model=model)
    if isinstance(exc, anthropic.APIStatusError):
        return _from_status_code(exc.status_code, provider, model, str(exc))
    return None


def _match_httpx_error(
    exc: Exception, provider: str, model: str,
) -> ExecutionError | None:
    if isinstance(exc, httpx.TimeoutException):
        return ExecutionError(ExecutionErrorCode.TIMEOUT, provider, model=model)
    if isinstance(exc, httpx.HTTPStatusError):
        return _from_status_code(exc.response.status_code, provider, model, str(exc))
    if isinstance(exc, httpx.ConnectError):
        return ExecutionError(ExecutionErrorCode.PROVIDER_UNAVAILABLE, provider, model=model)
    return None


def _match_connection_error(
    exc: Exception, provider: str, model: str,
) -> ExecutionError:
    if isinstance(exc, TimeoutError):
        return ExecutionError(ExecutionErrorCode.TIMEOUT, provider, model=model)
    if isinstance(exc, (ConnectionError, OSError)):
        return ExecutionError(ExecutionErrorCode.PROVIDER_UNAVAILABLE, provider, model=model)
    return ExecutionError(
        ExecutionErrorCode.PROVIDER_ERROR, provider, model=model, detail=str(exc),
    )


def _from_status_code(
    status_code: int, provider: str, model: str, detail: str,
) -> ExecutionError:
    code_map: dict[int, ExecutionErrorCode] = {
        401: ExecutionErrorCode.AUTH_FAILED,
        403: ExecutionErrorCode.PERMISSION_DENIED,
        404: ExecutionErrorCode.MODEL_NOT_FOUND,
        429: ExecutionErrorCode.RATE_LIMITED,
    }
    code = code_map.get(status_code, ExecutionErrorCode.PROVIDER_ERROR)
    is_retryable = status_code >= 500 or code in _RETRYABLE_CODES
    return ExecutionError(code, provider, model=model, is_retryable=is_retryable, detail=detail)


def _extract_retry_after(exc: Exception) -> float | None:
    headers = getattr(getattr(exc, "response", None), "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after")
    if not raw:
        return None
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def classify_tool_error(
    exc: Exception, tool_name: str, *, server_name: str | None = None,
) -> ExecutionError:
    from src.mcp.sdk_client import MCPClientError, MCPConnectionError, MCPToolError

    display = f"MCP: {server_name}" if server_name else tool_name

    if isinstance(exc, MCPConnectionError):
        return ExecutionError(
            ExecutionErrorCode.MCP_CONNECTION_FAILED, display, model=tool_name,
        )
    if isinstance(exc, MCPToolError):
        detail = str(exc)
        if "rate limit" in detail.lower():
            return ExecutionError(
                ExecutionErrorCode.RATE_LIMITED, display, model=tool_name,
            )
        return ExecutionError(
            ExecutionErrorCode.MCP_TOOL_ERROR, display, model=tool_name, detail=detail,
        )
    if isinstance(exc, MCPClientError):
        return ExecutionError(
            ExecutionErrorCode.MCP_TOOL_ERROR, display, model=tool_name, detail=str(exc),
        )
    if isinstance(exc, TimeoutError):
        return ExecutionError(ExecutionErrorCode.TOOL_TIMEOUT, display, model=tool_name)
    return ExecutionError(
        ExecutionErrorCode.TOOL_FAILED, display, model=tool_name, detail=str(exc),
    )


def to_sse_payload(err: ExecutionError) -> dict[str, Any]:
    return {
        "type": "error",
        "event": "execution_error",
        "error_code": err.code.value,
        "provider": err.provider,
        "model": err.model,
        "is_retryable": err.is_retryable,
        "retry_after": err.retry_after,
        "message": err.user_message,
    }
