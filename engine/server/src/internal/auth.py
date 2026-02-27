"""
Internal service authentication.

Provides HMAC-derived token verification for service-to-service
communication (sync service → agent runtime). The raw SECRET_KEY
is never used directly as a bearer token.
"""

import hashlib
import hmac

from fastapi import HTTPException, Request, status

from src.infra.config import get_settings


def derive_internal_token(secret_key: str) -> str:
    """Derive an internal service token from SECRET_KEY using HMAC-SHA256."""
    return hmac.new(
        secret_key.encode(),
        b"internal-service-token",
        hashlib.sha256,
    ).hexdigest()


def verify_internal_token(request: Request) -> None:
    """Verify that the request carries a valid internal service token.

    Raises HTTPException 403 if the token is missing or invalid.
    Uses constant-time comparison to prevent timing attacks.
    """
    settings = get_settings()
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal token",
        )

    provided_token = auth_header[7:]  # strip "Bearer "
    expected_token = derive_internal_token(settings.SECRET_KEY)

    if not hmac.compare_digest(provided_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal token",
        )


def get_internal_bearer_token() -> str:
    """Get the Bearer token string for outgoing internal requests."""
    settings = get_settings()
    return f"Bearer {derive_internal_token(settings.SECRET_KEY)}"
