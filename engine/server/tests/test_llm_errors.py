"""Tests for LLM error classification and SSE payload generation."""

from unittest.mock import MagicMock

import httpx

from src.llm.errors import (
    ExecutionError,
    ExecutionErrorCode,
    classify_llm_error,
    classify_tool_error,
    to_sse_payload,
)


class TestClassifyLlmErrorOpenAI:
    """Classify errors from the openai SDK."""

    def test_rate_limit(self) -> None:
        import openai

        response = MagicMock()
        response.status_code = 429
        response.headers = {"retry-after": "15"}
        exc = openai.RateLimitError(
            message="Rate limit exceeded",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "openai", "openai:gpt-4o")

        assert result.code == ExecutionErrorCode.RATE_LIMITED
        assert result.is_retryable is True
        assert result.retry_after == 15.0
        assert "OpenAI" in result.user_message
        assert "rate limit" in result.user_message.lower()

    def test_authentication(self) -> None:
        import openai

        response = MagicMock()
        response.status_code = 401
        response.headers = {}
        exc = openai.AuthenticationError(
            message="Invalid API key",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "openai", "openai:gpt-4o")

        assert result.code == ExecutionErrorCode.AUTH_FAILED
        assert result.is_retryable is False
        assert "OpenAI" in result.user_message

    def test_permission_denied(self) -> None:
        import openai

        response = MagicMock()
        response.status_code = 403
        response.headers = {}
        exc = openai.PermissionDeniedError(
            message="Forbidden",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "google", "google:gemini-2.0-flash")

        assert result.code == ExecutionErrorCode.PERMISSION_DENIED
        assert result.is_retryable is False
        assert "Google Gemini" in result.user_message

    def test_timeout(self) -> None:
        import openai

        exc = openai.APITimeoutError(request=MagicMock())

        result = classify_llm_error(exc, "mistral", "mistral:mistral-large")

        assert result.code == ExecutionErrorCode.TIMEOUT
        assert result.is_retryable is True
        assert "Mistral" in result.user_message

    def test_connection_error(self) -> None:
        import openai

        exc = openai.APIConnectionError(request=MagicMock())

        result = classify_llm_error(exc, "groq", "groq:llama3")

        assert result.code == ExecutionErrorCode.CONNECTION_FAILED
        assert result.is_retryable is True
        assert "Groq" in result.user_message

    def test_not_found(self) -> None:
        import openai

        response = MagicMock()
        response.status_code = 404
        response.headers = {}
        exc = openai.NotFoundError(
            message="Model not found",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "openai", "openai:gpt-999")

        assert result.code == ExecutionErrorCode.MODEL_NOT_FOUND
        assert "gpt-999" in result.user_message


class TestClassifyLlmErrorAnthropic:
    """Classify errors from the anthropic SDK."""

    def test_rate_limit(self) -> None:
        import anthropic

        response = MagicMock()
        response.status_code = 429
        response.headers = {"retry-after": "30"}
        exc = anthropic.RateLimitError(
            message="Rate limit exceeded",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "anthropic", "anthropic:claude-sonnet-4-20250514")

        assert result.code == ExecutionErrorCode.RATE_LIMITED
        assert result.is_retryable is True
        assert result.retry_after == 30.0
        assert "Anthropic" in result.user_message

    def test_authentication(self) -> None:
        import anthropic

        response = MagicMock()
        response.status_code = 401
        response.headers = {}
        exc = anthropic.AuthenticationError(
            message="Invalid API key",
            response=response,
            body=None,
        )

        result = classify_llm_error(exc, "anthropic", "anthropic:claude-sonnet-4-20250514")

        assert result.code == ExecutionErrorCode.AUTH_FAILED
        assert result.is_retryable is False
        assert "Anthropic" in result.user_message


class TestClassifyLlmErrorHttpx:
    """Classify raw httpx exceptions (Ollama, etc.)."""

    def test_connect_error(self) -> None:
        exc = httpx.ConnectError("Connection refused")

        result = classify_llm_error(exc, "ollama", "ollama:llama3.2")

        assert result.code == ExecutionErrorCode.PROVIDER_UNAVAILABLE
        assert result.is_retryable is True
        assert "Ollama" in result.user_message

    def test_timeout(self) -> None:
        exc = httpx.ReadTimeout("Read timed out")

        result = classify_llm_error(exc, "ollama", "ollama:llama3.2")

        assert result.code == ExecutionErrorCode.TIMEOUT
        assert result.is_retryable is True

    def test_http_status_429(self) -> None:
        request = httpx.Request("POST", "http://example.com")
        response = httpx.Response(429, request=request)
        exc = httpx.HTTPStatusError("Rate limited", request=request, response=response)

        result = classify_llm_error(exc, "cohere", "cohere:command-r")

        assert result.code == ExecutionErrorCode.RATE_LIMITED
        assert result.is_retryable is True

    def test_http_status_500(self) -> None:
        request = httpx.Request("POST", "http://example.com")
        response = httpx.Response(500, request=request)
        exc = httpx.HTTPStatusError("Server error", request=request, response=response)

        result = classify_llm_error(exc, "openai", "openai:gpt-4o")

        assert result.code == ExecutionErrorCode.PROVIDER_ERROR
        assert result.is_retryable is True


class TestClassifyLlmErrorStdlib:
    """Classify stdlib exceptions."""

    def test_connection_error(self) -> None:
        exc = ConnectionError("Connection refused")

        result = classify_llm_error(exc, "ollama", "ollama:llama3.2")

        assert result.code == ExecutionErrorCode.PROVIDER_UNAVAILABLE
        assert result.is_retryable is True

    def test_timeout_error(self) -> None:
        exc = TimeoutError("Timed out")

        result = classify_llm_error(exc, "openai", "openai:gpt-4o")

        assert result.code == ExecutionErrorCode.TIMEOUT
        assert result.is_retryable is True

    def test_generic_exception(self) -> None:
        exc = RuntimeError("Something went wrong")

        result = classify_llm_error(exc, "openai", "openai:gpt-4o")

        assert result.code == ExecutionErrorCode.PROVIDER_ERROR
        assert "OpenAI" in result.user_message


class TestClassifyToolError:
    """Classify MCP and tool errors."""

    def test_mcp_connection_error(self) -> None:
        from src.mcp.sdk_client import MCPConnectionError

        exc = MCPConnectionError("Connection refused")

        result = classify_tool_error(exc, "web_search", server_name="Brave Search")

        assert result.code == ExecutionErrorCode.MCP_CONNECTION_FAILED
        assert result.is_retryable is True
        assert "Brave Search" in result.provider

    def test_mcp_tool_error(self) -> None:
        from src.mcp.sdk_client import MCPToolError

        exc = MCPToolError("Tool returned error: invalid query")

        result = classify_tool_error(exc, "search", server_name="DuckDuckGo")

        assert result.code == ExecutionErrorCode.MCP_TOOL_ERROR
        assert result.is_retryable is False

    def test_mcp_tool_rate_limit(self) -> None:
        from src.mcp.sdk_client import MCPToolError

        exc = MCPToolError("Rate limit exceeded for server")

        result = classify_tool_error(exc, "search", server_name="Brave")

        assert result.code == ExecutionErrorCode.RATE_LIMITED
        assert result.is_retryable is True

    def test_timeout(self) -> None:
        exc = TimeoutError("Tool call timed out")

        result = classify_tool_error(exc, "web_scrape")

        assert result.code == ExecutionErrorCode.TOOL_TIMEOUT
        assert result.is_retryable is True

    def test_generic_error(self) -> None:
        exc = ValueError("Bad args")

        result = classify_tool_error(exc, "calculator")

        assert result.code == ExecutionErrorCode.TOOL_FAILED
        assert result.is_retryable is False


class TestToSsePayload:
    """Test SSE payload generation."""

    def test_payload_structure(self) -> None:
        err = ExecutionError(
            ExecutionErrorCode.RATE_LIMITED,
            "OpenAI",
            model="gpt-4o",
            retry_after=15.0,
        )

        payload = to_sse_payload(err)

        assert payload["type"] == "error"
        assert payload["event"] == "execution_error"
        assert payload["error_code"] == "rate_limited"
        assert payload["provider"] == "OpenAI"
        assert payload["model"] == "gpt-4o"
        assert payload["is_retryable"] is True
        assert payload["retry_after"] == 15.0
        assert "rate limit" in payload["message"].lower()

    def test_non_retryable(self) -> None:
        err = ExecutionError(
            ExecutionErrorCode.AUTH_FAILED,
            "Anthropic",
            model="claude-sonnet-4-20250514",
        )

        payload = to_sse_payload(err)

        assert payload["is_retryable"] is False
        assert payload["retry_after"] is None


class TestExecutionErrorMessage:
    """Test human-readable message generation."""

    def test_provider_display_name(self) -> None:
        err = ExecutionError(
            ExecutionErrorCode.AUTH_FAILED,
            "Google Gemini",
            model="gemini-2.0-flash",
        )

        assert "Google Gemini" in err.user_message
        assert "invalid" in err.user_message.lower() or "API key" in err.user_message

    def test_model_in_not_found_message(self) -> None:
        err = ExecutionError(
            ExecutionErrorCode.MODEL_NOT_FOUND,
            "Ollama",
            model="llama3.2",
        )

        assert "llama3.2" in err.user_message
        assert "Ollama" in err.user_message
