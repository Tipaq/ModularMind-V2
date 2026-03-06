"""Shared text utilities for the engine."""


def truncate(text: str, max_length: int) -> str:
    """Truncate text with ellipsis if it exceeds *max_length*."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 1] + "\u2026"
