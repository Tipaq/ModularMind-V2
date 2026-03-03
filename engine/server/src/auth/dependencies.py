"""
Auth dependencies.

FastAPI dependencies for authentication and authorization.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable
from typing import TYPE_CHECKING, Annotated

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from src.infra.config import get_settings
from src.infra.database import DbSession

from .models import User, UserRole
from .service import AuthService

# auto_error=False so missing Bearer header doesn't 401 before we check cookies
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Sentinel ID for Platform service account (not persisted in DB)
_PLATFORM_SERVICE_USER_ID = "platform-service"


def _derive_internal_token(secret_key: str) -> str:
    """Derive the HMAC-SHA256 internal service token from SECRET_KEY.

    Uses the same derivation as ``internal.auth.derive_internal_token``.
    """
    return hmac.new(
        secret_key.encode(),
        b"internal-service-token",
        hashlib.sha256,
    ).hexdigest()


def _is_internal_service_token(token: str) -> bool:
    """Check if a Bearer token is the HMAC-derived internal service token.

    Uses constant-time comparison to prevent timing attacks.
    """
    settings = get_settings()
    expected = _derive_internal_token(settings.SECRET_KEY)
    return hmac.compare_digest(token, expected)


async def _get_or_create_platform_service_user(db: "AsyncSession") -> User:
    """Get (or create on first use) the Platform service user in the database.

    Ensures the user exists in the ``users`` table so that foreign-key
    constraints on user-scoped tables (conversations, etc.) are satisfied.
    """
    from sqlalchemy import select

    result = await db.execute(
        select(User).where(User.id == _PLATFORM_SERVICE_USER_ID)
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    user = User(
        id=_PLATFORM_SERVICE_USER_ID,
        email="platform@service.internal",
        hashed_password="!service-account",
        role=UserRole.OWNER,
        is_active=True,
        platform_user_id=None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_current_user(
    request: Request,
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: DbSession,
) -> User:
    """Get the current authenticated user.

    Resolves the identity from (in priority order):
    1. HMAC-derived internal service token (Platform proxy → Engine)
    2. JWT from Authorization: Bearer header
    3. JWT from HttpOnly ``access_token`` cookie

    If the Bearer token matches the HMAC-derived internal service token,
    the Platform service user is returned from the database (created on
    first use to satisfy FK constraints).

    For JWT tokens, verifies the user's current role from the database
    (not just the JWT claim) to handle role changes after token issuance.

    Args:
        request: FastAPI request (for cookie access)
        token: Bearer token from Authorization header (may be None)
        db: Database session

    Returns:
        Authenticated user (real or Platform service user)

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Resolve token: Bearer header first, then HttpOnly cookie
    resolved_token = token or request.cookies.get("access_token")
    if not resolved_token:
        raise credentials_exception

    # Check internal service token (Platform proxy → Engine)
    if _is_internal_service_token(resolved_token):
        # When Platform forwards a user email, resolve to the real user
        # so conversations/memory are owned by the actual person.
        platform_email = request.headers.get("X-Platform-User-Email")
        if platform_email:
            auth_service = AuthService(db)
            real_user = await auth_service.get_user_by_email(platform_email)
            if real_user and real_user.is_active:
                return real_user
        # Fallback: anonymous service calls without a user context
        return await _get_or_create_platform_service_user(db)

    # Standard JWT path
    auth_service = AuthService(db)
    token_data = auth_service.verify_token(resolved_token)

    if token_data is None:
        raise credentials_exception

    user = await auth_service.get_user_by_id(token_data.user_id)
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Verify role from DB matches JWT claim to detect role changes
    if user.role != token_data.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token role outdated, please re-authenticate",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# Type alias for current user dependency
CurrentUser = Annotated[User, Depends(get_current_user)]


def require_min_role(min_role: UserRole) -> Callable:
    """Create a dependency that requires a minimum role level.

    Uses level-based comparison: user.role.level >= min_role.level.
    owner (2) > admin (1) > user (0).

    Args:
        min_role: Minimum required role

    Returns:
        FastAPI dependency function

    Example:
        @router.delete("/users/{id}")
        async def delete_user(
            user: CurrentUser,
            _: None = Depends(require_min_role(UserRole.OWNER)),
        ):
            ...
    """

    async def role_checker(user: CurrentUser) -> None:
        if user.role.level < min_role.level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role {min_role.value} or higher",
            )

    return role_checker


async def get_current_user_groups(
    user: CurrentUser,
    db: DbSession,
) -> list[str]:
    """Get the current user's group slugs from the database.

    Fetches from DB rather than trusting the JWT claim to prevent
    staleness when a user is removed from a group mid-session.
    """
    auth_service = AuthService(db)
    return await auth_service.get_user_group_slugs(user.id)


# Type alias for current user's groups
CurrentUserGroups = Annotated[list[str], Depends(get_current_user_groups)]


# Pre-built role dependencies (level-based)
RequireOwner = Depends(require_min_role(UserRole.OWNER))
RequireAdmin = Depends(require_min_role(UserRole.ADMIN))


async def verify_sync_token(
    request: Request,
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: DbSession,
) -> User | None:
    """Authenticate for the sync manifest endpoint.

    Accepts either:
    1. A valid JWT (human user via dashboard/API) → returns User
    2. A raw API key matching one of SYNC_API_KEYS → returns None (machine caller)

    Raises HTTPException 401 if neither matches.
    """
    resolved_token = token or request.cookies.get("access_token")
    if not resolved_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Try JWT first (human user)
    auth_service = AuthService(db)
    token_data = auth_service.verify_token(resolved_token)
    if token_data is not None:
        user = await auth_service.get_user_by_id(token_data.user_id)
        if user and user.is_active:
            return user

    # Fallback: check against SYNC_API_KEYS (machine-to-machine)
    settings = get_settings()
    for allowed_key in settings.sync_api_keys_list:
        if hmac.compare_digest(resolved_token, allowed_key):
            return None  # Authenticated as sync client, no User object

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token or sync API key",
        headers={"WWW-Authenticate": "Bearer"},
    )


# Type alias for sync-authenticated caller (User or None for machine clients)
SyncCaller = Annotated[User | None, Depends(verify_sync_token)]
