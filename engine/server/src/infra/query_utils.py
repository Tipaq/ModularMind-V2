"""
Shared SQLAlchemy query helpers.

Reusable utilities for building safe, consistent queries across modules.
"""


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
