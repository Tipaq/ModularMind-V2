"""
Auth router.

API endpoints for authentication.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from src.infra.config import get_settings
from src.infra.constants import RATE_LIMIT_LOGIN, RATE_LIMIT_PASSWORD, RATE_LIMIT_REFRESH
from src.infra.database import DbSession
from src.infra.rate_limit import RateLimitDependency

from .dependencies import CurrentUser
from .schemas import LoginResponse, PasswordChange, UserResponse
from .service import AuthService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/auth", tags=["Authentication"])


_login_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_LOGIN)
_password_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_PASSWORD)
_refresh_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_REFRESH)


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(_login_rate_limit)])
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
    response: Response,
) -> LoginResponse:
    """Authenticate user and return access token.

    Sets JWT as HttpOnly cookie (primary auth). The token is NOT
    included in the response body to prevent XSS-based token theft.
    Uses OAuth2 password flow for compatibility with OpenAPI.
    """
    auth_service = AuthService(db)
    user = await auth_service.authenticate_user(
        form_data.username,  # OAuth2 uses 'username' field for email
        form_data.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Pre-fetch groups before creating token (create_access_token is sync)
    group_slugs = await auth_service.get_user_group_slugs(user.id)
    access_token = auth_service.create_access_token(user, groups=group_slugs)

    # Clean up stale cookies from older path configurations to prevent
    # the browser from sending two access_token cookies (the old invalid
    # one taking priority over the fresh one).
    for stale_path in ("/", "/api/v1/auth"):
        response.delete_cookie(key="access_token", path=stale_path)
    for stale_path in ("/", "/api"):
        response.delete_cookie(key="refresh_token", path=stale_path)

    # Set JWT as HttpOnly cookie (prevents XSS token theft)
    # secure=True in production (HTTPS), False in dev (HTTP localhost)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.JWT_EXPIRE_SECONDS,
        path="/api",
    )

    # Set long-lived refresh token at narrow path (only sent to /api/v1/auth/*)
    refresh_token = auth_service.create_refresh_token(user)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/api/v1/auth",
    )

    logger.info("User logged in: user_id=%s", user.id)

    user_response = UserResponse.model_validate(user)

    return LoginResponse(
        expires_in=settings.JWT_EXPIRE_SECONDS,
        user=user_response,
    )


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, str]:
    """Clear authentication cookies and revoke refresh token."""
    # Best-effort: blacklist the refresh token's jti in Redis so it
    # cannot be replayed if the cookie is somehow retained by the client.
    refresh_cookie = request.cookies.get("refresh_token")
    if refresh_cookie:
        try:
            payload = pyjwt.decode(
                refresh_cookie,
                settings.SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
            jti = payload.get("jti")
            if jti:
                from src.infra.redis import get_redis_client

                redis_client = await get_redis_client()
                if redis_client:
                    try:
                        exp = datetime.fromtimestamp(payload["exp"], tz=UTC)
                        remaining = int((exp - datetime.now(UTC)).total_seconds())
                        if remaining > 0:
                            await redis_client.set(
                                f"refresh_blacklist:{jti}", "1", ex=remaining
                            )
                    finally:
                        await redis_client.aclose()
        except (pyjwt.InvalidTokenError, KeyError, ConnectionError, OSError):
            logger.warning("Best-effort token blacklist failed", exc_info=True)

    # Delete cookies at all possible paths
    for path in ("/api", "/", "/api/v1/auth"):
        response.delete_cookie(key="access_token", path=path)
    for path in ("/api/v1/auth", "/", "/api"):
        response.delete_cookie(key="refresh_token", path=path)

    return {"status": "ok"}


@router.post("/refresh", dependencies=[Depends(_refresh_rate_limit)])
async def refresh_tokens(
    request: Request,
    db: DbSession,
    response: Response,
) -> dict[str, str]:
    """Refresh access and refresh tokens using the refresh token cookie.

    Implements token rotation: each refresh issues a new refresh token
    and blacklists the old one in Redis to prevent replay.
    """
    refresh_cookie = request.cookies.get("refresh_token")
    if not refresh_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    auth_service = AuthService(db)
    token_data = auth_service.verify_refresh_token(refresh_cookie)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Check Redis blacklist for revoked tokens
    from src.infra.redis import get_redis_client

    redis_client = await get_redis_client()
    if redis_client:
        try:
            is_blacklisted = await redis_client.exists(
                f"refresh_blacklist:{token_data.jti}"
            )
            if is_blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token has been revoked",
                )
        finally:
            await redis_client.aclose()

    # Verify user still exists and is active
    user = await auth_service.get_user_by_id(token_data.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )

    # Blacklist the old refresh token's jti (token rotation)
    redis_client = await get_redis_client()
    if redis_client:
        try:
            remaining_ttl = int(
                (token_data.exp - datetime.now(UTC)).total_seconds()
            )
            if remaining_ttl > 0:
                await redis_client.set(
                    f"refresh_blacklist:{token_data.jti}", "1", ex=remaining_ttl
                )
        finally:
            await redis_client.aclose()

    # Issue new token pair
    group_slugs = await auth_service.get_user_group_slugs(user.id)
    new_access_token = auth_service.create_access_token(user, groups=group_slugs)
    new_refresh_token = auth_service.create_refresh_token(user)

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.JWT_EXPIRE_SECONDS,
        path="/api",
    )
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/api/v1/auth",
    )

    logger.info("Tokens refreshed for user_id=%s", user.id)
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(user: CurrentUser) -> UserResponse:
    """Get current user information."""
    return UserResponse.model_validate(user)



@router.put("/me", response_model=UserResponse, dependencies=[Depends(_password_rate_limit)])
async def update_current_user(
    user: CurrentUser,
    password_change: PasswordChange,
    db: DbSession,
) -> UserResponse:
    """Update current user's password."""
    auth_service = AuthService(db)

    # Verify current password
    if not auth_service.verify_password(
        password_change.current_password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Update password
    await auth_service.update_password(user, password_change.new_password)
    await db.commit()

    logger.info("User updated password: user_id=%s", user.id)

    return UserResponse.model_validate(user)
