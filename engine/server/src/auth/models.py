"""
Auth models.

SQLAlchemy models for authentication and authorization.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

if TYPE_CHECKING:
    from src.groups.models import UserGroupMember

from sqlalchemy import String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infra.database import Base


class UserRole(str, Enum):
    """User role enumeration.

    Strict hierarchy: owner (2) > admin (1) > user (0).
    Permission checks use level comparison: user.role.level >= min_role.level
    """

    OWNER = "owner"
    ADMIN = "admin"
    USER = "user"

    @property
    def level(self) -> int:
        return {"owner": 2, "admin": 1, "user": 0}[self.value]


class UserSource(str, Enum):
    """How the user was created."""

    LOCAL = "local"        # CLI create-admin or direct creation
    PLATFORM = "platform"  # Synced from platform


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.USER,
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    source: Mapped[UserSource] = mapped_column(
        SQLEnum(UserSource, values_callable=lambda x: [e.value for e in x]),
        default=UserSource.LOCAL,
    )
    platform_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), unique=True, nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    group_memberships: Mapped[list["UserGroupMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role.value})>"
