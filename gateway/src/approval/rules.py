"""Approval rule validation — prevents dangerously broad patterns."""

from __future__ import annotations

MAX_PATTERN_DEPTH = 3        # max ** segments
MAX_RULES_PER_AGENT = 100   # prevent rule explosion
FORBIDDEN_PATTERNS = {"/**", "**/*", "*", "**", "/*"}


def validate_remember_pattern(
    pattern: str,
    agent_id: str | None,
) -> str | None:
    """Validate a pattern for "Approve & Remember".

    Returns error message string, or None if valid.
    """
    if not pattern or not pattern.strip():
        return "Pattern must not be empty."

    if pattern in FORBIDDEN_PATTERNS:
        return f"Pattern '{pattern}' is too broad. Use a more specific pattern."

    if pattern.count("**") > MAX_PATTERN_DEPTH:
        return f"Pattern has too many ** segments (max {MAX_PATTERN_DEPTH})."

    if agent_id is None:
        return (
            "Rules must be scoped to a specific agent. "
            "Global rules are not allowed via 'Approve & Remember'."
        )

    return None
