"""
Auth schemas.

Pydantic models for authentication requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from .models import UserRole


class LoginRequest(BaseModel):
    """Login request schema."""

    email: EmailStr
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    """Login response schema.

    The JWT is set as an HttpOnly cookie — it is NOT included in the
    response body to prevent XSS-based token theft.
    """

    token_type: str = "bearer"
    expires_in: int
    user: "UserResponse"


class UserCreate(BaseModel):
    """User creation schema."""

    email: EmailStr
    password: str = Field(min_length=10)
    role: UserRole = UserRole.USER


class UserResponse(BaseModel):
    """User response schema."""

    id: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """User update schema."""

    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    role: UserRole | None = None
    is_active: bool | None = None


class TokenData(BaseModel):
    """Token payload data."""

    user_id: str
    email: str
    role: UserRole
    groups: list[str] = Field(default_factory=list)
    exp: datetime


class RefreshTokenData(BaseModel):
    """Refresh token payload data."""

    user_id: str
    email: str
    jti: str
    token_type: str
    exp: datetime


class PasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str = Field(min_length=10)


class PreferencesResponse(BaseModel):
    """User preferences response."""

    preferences: str | None = None


class PreferencesUpdate(BaseModel):
    """User preferences update request."""

    preferences: str = Field(max_length=2000)


class UserListResponse(BaseModel):
    """Admin user listing response with extended fields."""

    id: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Update forward references
LoginResponse.model_rebuild()
