"""Auth module - Authentication and authorization.

Only re-exports frequently used symbols.  For anything else, import directly
from the submodule (e.g. ``from src.auth.models import User``).
"""

from .dependencies import CurrentUser, CurrentUserGroups, RequireAdmin, RequireOwner
from .models import UserRole
from .schemas import UserCreate
from .service import AuthService

__all__ = [
    "AuthService",
    "CurrentUser",
    "CurrentUserGroups",
    "RequireAdmin",
    "RequireOwner",
    "UserCreate",
    "UserRole",
]
