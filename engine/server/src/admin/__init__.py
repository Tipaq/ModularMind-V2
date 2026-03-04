"""Admin module — user management and moderation endpoints."""

from .user_router import admin_user_router

__all__ = ["admin_user_router"]

# Re-export schemas and service for external consumers
from .schemas import *  # noqa: F401, F403
from .service import compute_user_cost, get_range_start, get_user_or_404  # noqa: F401
