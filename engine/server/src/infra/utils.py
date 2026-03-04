"""Shared utility helpers for the engine."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return a timezone-naive UTC datetime.

    Required by asyncpg for ``TIMESTAMP WITHOUT TIME ZONE`` columns.
    Replaces the deprecated ``datetime.utcnow()``.
    """
    return datetime.now(UTC).replace(tzinfo=None)
