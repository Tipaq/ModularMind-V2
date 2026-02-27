"""Token pricing for cloud LLM providers.

Hardcoded pricing table for cost estimation. Local models (Ollama)
return None. Updated manually when providers change pricing.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPricing:
    prompt: float  # USD per 1M tokens
    completion: float  # USD per 1M tokens
    provider: str


# Prices in USD per 1M tokens — updated manually.
# Keys are the model_name part (after the provider prefix in "provider:model" format).
TOKEN_PRICING: dict[str, ModelPricing] = {
    # OpenAI
    "gpt-4o": ModelPricing(prompt=2.50, completion=10.00, provider="openai"),
    "gpt-4o-mini": ModelPricing(prompt=0.15, completion=0.60, provider="openai"),
    "gpt-4-turbo": ModelPricing(prompt=10.00, completion=30.00, provider="openai"),
    "gpt-3.5-turbo": ModelPricing(prompt=0.50, completion=1.50, provider="openai"),
    "o1": ModelPricing(prompt=15.00, completion=60.00, provider="openai"),
    "o1-mini": ModelPricing(prompt=3.00, completion=12.00, provider="openai"),
    # Anthropic
    "claude-opus-4-6": ModelPricing(prompt=15.00, completion=75.00, provider="anthropic"),
    "claude-sonnet-4-5-20250929": ModelPricing(prompt=3.00, completion=15.00, provider="anthropic"),
    "claude-haiku-4-5-20251001": ModelPricing(prompt=0.80, completion=4.00, provider="anthropic"),
    # Google
    "gemini-2.0-flash": ModelPricing(prompt=0.10, completion=0.40, provider="google"),
    "gemini-1.5-pro": ModelPricing(prompt=1.25, completion=5.00, provider="google"),
    # Mistral
    "mistral-large-latest": ModelPricing(prompt=2.00, completion=6.00, provider="mistral"),
    "mistral-small-latest": ModelPricing(prompt=0.20, completion=0.60, provider="mistral"),
    # Cohere
    "command-r-plus": ModelPricing(prompt=2.50, completion=10.00, provider="cohere"),
    "command-r": ModelPricing(prompt=0.15, completion=0.60, provider="cohere"),
}


def parse_model_name(model_id: str) -> str:
    """Extract model name from 'provider:model_name' format.

    Examples:
        'openai:gpt-4o' -> 'gpt-4o'
        'ollama:llama3.2' -> 'llama3.2'
        'gpt-4o' -> 'gpt-4o'  (no prefix = passthrough)
    """
    return model_id.split(":", 1)[-1] if ":" in model_id else model_id


def estimate_cost(
    model_id: str, prompt_tokens: int, completion_tokens: int
) -> float | None:
    """Return estimated cost in USD, or None if model is local/unknown.

    Accepts both 'provider:model' and bare 'model' formats.
    """
    model_name = parse_model_name(model_id)
    pricing = TOKEN_PRICING.get(model_name)
    if not pricing:
        return None  # Local model (Ollama) or unknown
    return (prompt_tokens * pricing.prompt + completion_tokens * pricing.completion) / 1_000_000


def get_provider(model_id: str) -> str | None:
    """Return provider name or None for local/unknown models."""
    model_name = parse_model_name(model_id)
    pricing = TOKEN_PRICING.get(model_name)
    return pricing.provider if pricing else None
