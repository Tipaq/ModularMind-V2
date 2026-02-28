"""
Internal providers router.

Provider testing and model pull endpoints.
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from src.auth import CurrentUser, RequireOwner
from src.infra.config import get_settings
from src.infra.constants import KNOWN_PROVIDERS
from src.infra.secrets import secrets_store
from src.internal.auth import verify_internal_token

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Internal - Providers"])


# ── Schemas ────────────────────────────────────────────────────────


class ProviderTestRequest(BaseModel):
    provider: str
    api_key: str | None = None
    base_url: str | None = None


class ProviderTestResponse(BaseModel):
    provider: str
    available: bool
    error: str | None = None


class InternalPullRequest(BaseModel):
    model_name: str


# ── Endpoints ──────────────────────────────────────────────────────


@router.post("/providers/test", dependencies=[RequireOwner])
async def test_provider_connection(
    body: ProviderTestRequest, user: CurrentUser
) -> ProviderTestResponse:
    """Test a provider connection.

    For cloud providers, temporarily uses the provided API key.
    For Ollama, tests the base URL connectivity.
    """
    # Validate provider name against known providers to prevent SSRF
    if body.provider.lower() not in KNOWN_PROVIDERS:
        return ProviderTestResponse(
            provider=body.provider,
            available=False,
            error="Unknown provider",
        )

    # Validate base_url to prevent SSRF attacks against internal services
    if body.base_url:
        from urllib.parse import urlparse

        parsed = urlparse(body.base_url)
        hostname = (parsed.hostname or "").lower()
        if not parsed.scheme or parsed.scheme not in ("http", "https"):
            return ProviderTestResponse(
                provider=body.provider, available=False,
                error="Only http/https URLs are allowed",
            )
        # Block internal/private hostnames
        _blocked = ("localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "::1")
        if (
            hostname in _blocked
            or hostname.startswith("10.")
            or hostname.startswith("172.16.") or hostname.startswith("172.17.")
            or hostname.startswith("172.18.") or hostname.startswith("172.19.")
            or hostname.startswith("172.2") or hostname.startswith("172.3")
            or hostname.startswith("192.168.")
            or hostname.endswith(".internal")
            or hostname.endswith(".local")
        ):
            return ProviderTestResponse(
                provider=body.provider, available=False,
                error="Internal URLs are not allowed for provider testing",
            )

    try:
        from src.llm import get_llm_provider

        kwargs: dict = {}

        if body.provider == "ollama":
            kwargs["base_url"] = body.base_url or settings.OLLAMA_BASE_URL
        else:
            # Use provided key or fall back to stored key
            api_key = body.api_key
            if not api_key:
                api_key = secrets_store.get_provider_key(body.provider)
            if not api_key:
                return ProviderTestResponse(
                    provider=body.provider,
                    available=False,
                    error="No API key provided or configured",
                )
            kwargs["api_key"] = api_key
            if body.base_url:
                kwargs["base_url"] = body.base_url

        provider = get_llm_provider(body.provider, **kwargs)
        available = await provider.is_available()

        return ProviderTestResponse(
            provider=body.provider,
            available=available,
            error=None if available else "Provider not reachable",
        )
    except ValueError:
        return ProviderTestResponse(
            provider=body.provider, available=False, error="Invalid provider configuration"
        )
    except Exception as e:
        logger.warning("Provider test failed for %s: %s", body.provider, e)
        return ProviderTestResponse(
            provider=body.provider, available=False, error="Provider test failed"
        )


@router.get("/token-pricing", dependencies=[RequireOwner])
async def get_token_pricing(user: CurrentUser) -> dict:
    """Return hardcoded token pricing table for cloud LLM providers.

    Local models (Ollama) are not listed. Pricing is per 1M tokens in USD.
    """
    from src.infra.token_pricing import TOKEN_PRICING

    models = [
        {
            "model": model_name,
            "provider": pricing.provider,
            "prompt_per_1m": pricing.prompt,
            "completion_per_1m": pricing.completion,
        }
        for model_name, pricing in TOKEN_PRICING.items()
    ]
    return {"models": models}


@router.post("/models/pull")
async def internal_pull_model(body: InternalPullRequest, request: Request) -> dict:
    """Trigger an Ollama model pull (called by sync service for required models).

    Protected by HMAC-derived internal token, same as /reload.
    """
    verify_internal_token(request)

    from src.models.service import get_model_service
    svc = get_model_service()
    task_id = svc.trigger_pull(body.model_name)

    logger.info("Internal model pull triggered: %s -> task %s", body.model_name, task_id)
    return {"status": "dispatched", "task_id": task_id, "model_name": body.model_name}
