"""Auth module - Authentication and authorization."""

from .dependencies import (
    CurrentUser,
    CurrentUserGroups,
    RequireAdmin,
    RequireOwner,
    SyncCaller,
    get_current_user,
    get_current_user_groups,
    require_min_role,
    verify_sync_token,
)
from .models import User, UserRole, UserSource
from .router import router
from .schemas import (
    LoginRequest,
    LoginResponse,
    PasswordChange,
    RefreshTokenData,
    TokenData,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from .service import AuthService

__all__ = [
    # Models
    "User",
    "UserRole",
    "UserSource",
    # Schemas
    "LoginRequest",
    "LoginResponse",
    "UserCreate",
    "UserResponse",
    "UserUpdate",
    "TokenData",
    "RefreshTokenData",
    "PasswordChange",
    # Service
    "AuthService",
    # Dependencies
    "get_current_user",
    "get_current_user_groups",
    "CurrentUser",
    "CurrentUserGroups",
    "require_min_role",
    "RequireOwner",
    "RequireAdmin",
    "verify_sync_token",
    "SyncCaller",
    # Router
    "router",
]
