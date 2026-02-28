"""Dynamic model discovery from cloud provider APIs.

Fetches available models from provider APIs when an API key is configured.
Results are normalized to a common format for the browsable catalog.
All fetchers are non-fatal — they return empty lists on error.
"""

import logging

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0


async def fetch_openai_models(api_key: str) -> list[dict]:
    """Fetch models from OpenAI API."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        # OpenAI returns minimal info — filter to chat-capable models
        chat_prefixes = ("gpt-", "o1", "o3", "o4", "chatgpt-")
        results = []
        for m in data.get("data", []):
            model_id = m.get("id", "")
            if not any(model_id.startswith(p) for p in chat_prefixes):
                continue
            # Skip fine-tune variants and snapshots
            if ":ft-" in model_id or model_id.count("-") > 4:
                continue
            results.append({
                "model_name": model_id,
                "display_name": model_id,
                "context_window": None,
                "max_output_tokens": None,
                "capabilities": {"chat": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch OpenAI models: %s", e)
        return []


async def fetch_anthropic_models(api_key: str) -> list[dict]:
    """Fetch models from Anthropic API."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                params={"limit": 100},
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for m in data.get("data", []):
            model_id = m.get("id", "")
            display = m.get("display_name", model_id)
            results.append({
                "model_name": model_id,
                "display_name": display,
                "context_window": 200000,
                "max_output_tokens": 8192,
                "capabilities": {"chat": True, "function_calling": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch Anthropic models: %s", e)
        return []


async def fetch_google_models(api_key: str) -> list[dict]:
    """Fetch models from Google Gemini API."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": api_key, "pageSize": 100},
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for m in data.get("models", []):
            name = m.get("name", "")  # "models/gemini-2.0-flash"
            model_id = name.removeprefix("models/")
            display = m.get("displayName", model_id)
            methods = m.get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                continue
            results.append({
                "model_name": model_id,
                "display_name": display,
                "context_window": m.get("inputTokenLimit"),
                "max_output_tokens": m.get("outputTokenLimit"),
                "capabilities": {"chat": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch Google models: %s", e)
        return []


async def fetch_mistral_models(api_key: str) -> list[dict]:
    """Fetch models from Mistral API."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.mistral.ai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for m in data.get("data", []):
            model_id = m.get("id", "")
            results.append({
                "model_name": model_id,
                "display_name": model_id,
                "context_window": m.get("max_context_length"),
                "max_output_tokens": None,
                "capabilities": {"chat": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch Mistral models: %s", e)
        return []


async def fetch_cohere_models(api_key: str) -> list[dict]:
    """Fetch models from Cohere API."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.cohere.ai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for m in data.get("models", []):
            model_id = m.get("name", "")
            endpoints = m.get("endpoints", [])
            if "chat" not in endpoints and "generate" not in endpoints:
                continue
            results.append({
                "model_name": model_id,
                "display_name": model_id,
                "context_window": m.get("context_length"),
                "max_output_tokens": None,
                "capabilities": {"chat": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch Cohere models: %s", e)
        return []


async def fetch_groq_models(api_key: str) -> list[dict]:
    """Fetch models from Groq API (OpenAI-compatible)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for m in data.get("data", []):
            model_id = m.get("id", "")
            context = m.get("context_window")
            results.append({
                "model_name": model_id,
                "display_name": model_id,
                "context_window": context,
                "max_output_tokens": None,
                "capabilities": {"chat": True},
                "source": "dynamic",
            })
        return results
    except Exception as e:
        logger.warning("Failed to fetch Groq models: %s", e)
        return []


_FETCHERS: dict[str, callable] = {
    "openai": fetch_openai_models,
    "anthropic": fetch_anthropic_models,
    "google": fetch_google_models,
    "mistral": fetch_mistral_models,
    "cohere": fetch_cohere_models,
    "groq": fetch_groq_models,
}


async def fetch_provider_models(provider: str, api_key: str) -> list[dict]:
    """Fetch models from a provider API. Returns empty list on unsupported provider."""
    fetcher = _FETCHERS.get(provider)
    if not fetcher:
        return []
    return await fetcher(api_key)
