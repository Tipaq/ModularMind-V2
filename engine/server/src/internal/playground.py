"""
Internal playground router.

LLM playground/completion endpoints for testing models.
"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.auth import CurrentUser, RequireOwner
from src.infra.config import get_settings
from src.infra.constants import KNOWN_PROVIDERS
from src.infra.rate_limit import RateLimitDependency
from src.infra.secrets import secrets_store

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Internal - Playground"])


# ── Schemas ────────────────────────────────────────────────────────


class PlaygroundMessage(BaseModel):
    role: str
    content: str


class PlaygroundCompletionRequest(BaseModel):
    provider: str
    model: str
    messages: list[PlaygroundMessage]
    max_tokens: int = 1024
    temperature: float = 0.7


class PlaygroundCompletionResponseBody(BaseModel):
    content: str
    model: str
    usage: dict[str, int]
    latency_ms: int


# ── Endpoints ──────────────────────────────────────────────────────


@router.post(
    "/playground/completions",
    dependencies=[RequireOwner, Depends(RateLimitDependency(10))],
)
async def playground_completion(
    body: PlaygroundCompletionRequest, user: CurrentUser
) -> PlaygroundCompletionResponseBody:
    """Run a completion request against a configured provider.

    Requires OWNER role (costs real tokens).
    """
    # Validate provider name against known providers to prevent SSRF
    if body.provider.lower() not in KNOWN_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {body.provider}",
        )

    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    from src.llm import get_llm_provider

    # Get API key from secrets store
    kwargs: dict = {}
    if body.provider == "ollama":
        kwargs["base_url"] = settings.OLLAMA_BASE_URL
    else:
        api_key = secrets_store.get_provider_key(body.provider)
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Provider '{body.provider}' is not configured. Add an API key in Settings.",
            )
        kwargs["api_key"] = api_key

    try:
        provider = get_llm_provider(body.provider, **kwargs)
    except ValueError as e:
        logger.warning("Invalid provider configuration for playground: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider configuration",
        )

    # Build LangChain messages
    lc_messages = []
    for msg in body.messages:
        if msg.role == "system":
            lc_messages.append(SystemMessage(content=msg.content))
        elif msg.role == "user":
            lc_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            lc_messages.append(AIMessage(content=msg.content))

    try:
        chat_model = await provider.get_model(
            body.model,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        )

        start_ms = int(time.time() * 1000)
        result = await chat_model.ainvoke(lc_messages)
        latency_ms = int(time.time() * 1000) - start_ms

        # Extract usage from response metadata
        usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }
        if hasattr(result, "usage_metadata") and result.usage_metadata:
            usage["prompt_tokens"] = result.usage_metadata.get("input_tokens", 0)
            usage["completion_tokens"] = result.usage_metadata.get("output_tokens", 0)
            usage["total_tokens"] = result.usage_metadata.get("total_tokens", 0)
        elif hasattr(result, "response_metadata"):
            token_usage = result.response_metadata.get("token_usage", {})
            usage["prompt_tokens"] = token_usage.get("prompt_tokens", 0)
            usage["completion_tokens"] = token_usage.get("completion_tokens", 0)
            usage["total_tokens"] = token_usage.get("total_tokens", 0)

        # Fallback: estimate tokens with tiktoken if provider returned nothing
        if not usage["total_tokens"]:
            from src.infra.token_counter import count_tokens
            prompt_text = " ".join(
                msg.content for msg in body.messages if msg.content
            )
            resp_text = result.content if isinstance(result.content, str) else str(result.content)
            usage["prompt_tokens"] = count_tokens(prompt_text)
            usage["completion_tokens"] = count_tokens(resp_text)
            usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]

        return PlaygroundCompletionResponseBody(
            content=result.content if isinstance(result.content, str) else str(result.content),
            model=body.model,
            usage=usage,
            latency_ms=latency_ms,
        )
    except Exception:
        logger.warning("Playground completion failed for provider=%s model=%s", body.provider, body.model)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Completion failed due to an internal error",
        )
