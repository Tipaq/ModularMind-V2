"""
Auth service.

Handles user authentication, token generation, and password hashing.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.config import get_settings
from src.infra.query_utils import escape_like

from .models import User, UserRole
from .schemas import RefreshTokenData, TokenData, UserCreate

logger = logging.getLogger(__name__)
settings = get_settings()


class AuthService:
    """Authentication service."""

    def __init__(self, db: AsyncSession):
        """Initialize auth service.

        Args:
            db: Database session
        """
        self.db = db

    async def create_user(self, data: UserCreate) -> User:
        """Create a new user.

        Args:
            data: User creation data

        Returns:
            Created user

        Raises:
            ValueError: If email already exists or password too weak
        """
        # Check if email exists
        existing = await self.get_user_by_email(data.email)
        if existing:
            raise ValueError("Email already registered")

        # Validate password strength
        self.validate_password_strength(data.password)

        # Hash password (offloaded to thread to avoid blocking event loop)
        hashed_password = await self.hash_password_async(data.password)

        # Create user
        user = User(
            email=data.email,
            hashed_password=hashed_password,
            role=data.role,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)

        logger.info("Created user: %s with role %s", user.email, user.role)
        return user

    async def list_users(
        self,
        role_filter: UserRole | None = None,
        is_active: bool | None = None,
        search: str | None = None,
    ) -> list[User]:
        """List users with optional filters (admin only)."""
        query = select(User)
        if role_filter is not None:
            query = query.where(User.role == role_filter)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search:
            escaped = escape_like(search)
            query = query.where(User.email.ilike(f"%{escaped}%", escape="\\"))
        query = query.order_by(User.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # Pre-computed dummy hash for constant-time auth (prevents user enumeration
    # via timing side-channel: bcrypt check runs even for non-existent users).
    _DUMMY_HASH = bcrypt.hashpw(b"dummy-timing-pad", bcrypt.gensalt()).decode()

    async def authenticate_user(self, email: str, password: str) -> User | None:
        """Authenticate a user.

        Uses constant-time pattern: always runs bcrypt.checkpw() even when the
        user does not exist, so an attacker cannot distinguish "wrong email"
        from "wrong password" via response timing.

        bcrypt is offloaded to a thread to avoid blocking the async event loop.

        Args:
            email: User email
            password: Plain text password

        Returns:
            User if authentication successful, None otherwise
        """
        user = await self.get_user_by_email(email)
        if not user:
            # Run bcrypt on dummy hash to keep response time constant
            await asyncio.to_thread(self.verify_password, password, self._DUMMY_HASH)
            return None
        if not user.is_active:
            return None
        if not await asyncio.to_thread(self.verify_password, password, user.hashed_password):
            return None
        return user

    async def get_user_by_email(self, email: str) -> User | None:
        """Get user by email.

        Args:
            email: User email

        Returns:
            User if found, None otherwise
        """
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: str) -> User | None:
        """Get user by ID.

        Args:
            user_id: User ID

        Returns:
            User if found, None otherwise
        """
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def update_password(self, user: User, new_password: str) -> None:
        """Update user password.

        Args:
            user: User to update
            new_password: New plain text password

        Raises:
            ValueError: If password does not meet strength requirements
        """
        self.validate_password_strength(new_password)
        user.hashed_password = await self.hash_password_async(new_password)
        await self.db.flush()

    async def get_user_group_slugs(self, user_id: str) -> list[str]:
        """Fetch group slugs for a user from the DB.

        Delegates to GroupService to avoid query duplication.
        """
        from src.groups.service import GroupService

        return await GroupService(self.db).get_user_group_slugs(
            user_id,
        )

    def create_access_token(self, user: User, groups: list[str] | None = None) -> str:
        """Create JWT access token.

        Args:
            user: User to create token for
            groups: Pre-fetched group slugs (must be fetched before calling this sync method)

        Returns:
            JWT token string
        """
        expire = datetime.now(UTC) + timedelta(
            seconds=settings.JWT_EXPIRE_SECONDS
        )
        payload: dict[str, Any] = {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "groups": groups or [],
            "exp": expire,
        }
        return jwt.encode(
            payload,
            settings.SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )

    def verify_token(self, token: str) -> TokenData | None:
        """Verify and decode JWT token.

        Args:
            token: JWT token string

        Returns:
            TokenData if valid, None otherwise
        """
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
            return TokenData(
                user_id=payload["sub"],
                email=payload["email"],
                role=UserRole(payload["role"]),
                groups=payload.get("groups", []),
                exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
            )
        except (jwt.InvalidTokenError, KeyError) as e:
            logger.warning("Token verification failed: %s", e)
            return None

    def create_refresh_token(self, user: User) -> str:
        """Create a long-lived refresh token with a unique jti for revocation.

        The refresh token intentionally omits role and groups so that
        these are re-fetched from the database on each refresh, ensuring
        role changes take effect promptly.
        """
        from uuid import uuid4

        expire = datetime.now(UTC) + timedelta(
            seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS
        )
        payload: dict[str, Any] = {
            "sub": user.id,
            "email": user.email,
            "type": "refresh",
            "jti": str(uuid4()),
            "exp": expire,
        }
        return jwt.encode(
            payload,
            settings.SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )

    def verify_refresh_token(self, token: str) -> RefreshTokenData | None:
        """Verify and decode a refresh token JWT.

        Only validates the cryptographic signature, expiry, and token type.
        The caller must separately check the Redis blacklist for jti revocation.
        """
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
            if payload.get("type") != "refresh":
                logger.warning("Token is not a refresh token")
                return None
            return RefreshTokenData(
                user_id=payload["sub"],
                email=payload["email"],
                jti=payload["jti"],
                token_type=payload["type"],
                exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
            )
        except (jwt.InvalidTokenError, KeyError) as e:
            logger.warning("Refresh token verification failed: %s", e)
            return None

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password (sync — use hash_password_async for async contexts).

        Args:
            password: Plain text password

        Returns:
            Hashed password
        """
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    async def hash_password_async(password: str) -> str:
        """Hash a password without blocking the event loop."""
        return await asyncio.to_thread(AuthService.hash_password, password)

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        """Verify a password against its hash.

        Args:
            plain: Plain text password
            hashed: Hashed password

        Returns:
            True if password matches
        """
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            logger.warning("Password verification error (invalid hash format)")
            return False

    @staticmethod
    def validate_password_strength(password: str) -> None:
        """Validate password meets minimum strength requirements.

        Raises:
            ValueError: If password does not meet requirements
        """
        if len(password) < 10:
            raise ValueError("Password must be at least 10 characters long")
        if len(password) > 128:
            raise ValueError("Password must be at most 128 characters long")
        if not any(c.isupper() for c in password):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in password):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in password):
            raise ValueError("Password must contain at least one digit")
        if all(c.isalnum() for c in password):
            raise ValueError("Password must contain at least one special character")
