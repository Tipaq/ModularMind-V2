"""
Shared query and HTTP helpers.

Reusable utilities for building safe, consistent queries across modules.
"""

from __future__ import annotations

from fastapi import HTTPException


def raise_not_found(resource: str) -> None:
    """Raise a 404 HTTPException with a consistent message.

    Usage::

        if not conversation:
            raise_not_found("Conversation")
    """
    raise HTTPException(status_code=404, detail=f"{resource} not found")


def escape_like(search: str) -> str:
    """Escape LIKE-special characters to prevent pattern injection.

    Must be paired with ``escape="\\\\"`` in the ILIKE/LIKE call::

        escaped = escape_like(user_input)
        query.where(Model.field.ilike(f"%{escaped}%", escape="\\\\"))
    """
    return (
        search
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )
