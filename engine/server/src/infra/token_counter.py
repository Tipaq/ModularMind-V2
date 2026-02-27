"""Fallback token counter using tiktoken.

Used when LLM providers don't return token usage metadata (e.g., some
vLLM/TGI deployments). Uses cl100k_base encoding as a universal estimator
— not exact for non-OpenAI models but far better than reporting 0.
"""

import logging

import tiktoken

logger = logging.getLogger(__name__)

_encoding = tiktoken.encoding_for_model("gpt-4")


def count_tokens(text: str) -> int:
    """Count tokens in a text string using cl100k_base encoding."""
    if not text:
        return 0
    try:
        return len(_encoding.encode(text))
    except Exception:
        logger.debug("tiktoken encoding failed, falling back to word estimate")
        return len(text.split()) * 4 // 3


def count_message_tokens(messages: list[dict[str, str]]) -> int:
    """Estimate token count for a list of chat messages.

    Each message contributes its content tokens plus ~4 overhead tokens
    for role/formatting (following OpenAI's token counting convention).
    """
    total = 0
    for msg in messages:
        total += 4  # role + formatting overhead
        content = msg.get("content", "")
        if isinstance(content, str):
            total += count_tokens(content)
    total += 2  # priming tokens
    return total
