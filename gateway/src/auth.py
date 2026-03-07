"""Gateway authentication.

Two auth methods:
1. HMAC internal token — for engine-to-gateway calls (execute, release)
2. JWT admin token — for admin endpoints (approvals, rules, audit, workspace)

Uses the same SECRET_KEY as the engine for HMAC derivation.
"""

import hashlib
import hmac
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from src.config import get_settings

logger = logging.getLogger(__name__)


def derive_internal_token(secret_key: str) -> str:
    """Derive an internal service token from SECRET_KEY using HMAC-SHA256.

    Must match the engine's derive_internal_token in internal/auth.py.
    """
    return hmac.new(
        secret_key.encode(),
        b"internal-service-token",
        hashlib.sha256,
    ).hexdigest()


def verify_internal_token(request: Request) -> None:
    """Verify that the request carries a valid internal service token.

    Used for engine → gateway calls (execute, release).
    Raises HTTPException 403 if invalid.
    """
    settings = get_settings()
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal token",
        )

    provided_token = auth_header[7:]
    expected_token = derive_internal_token(settings.SECRET_KEY)

    if not hmac.compare_digest(provided_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal token",
        )


def verify_admin_token(request: Request) -> str:
    """Verify admin JWT token for approval/audit/rules endpoints.

    Returns the admin user_id from the token.

    NOTE: In Phase 1, this uses the same internal token as a placeholder.
    Phase 4 will add proper JWT validation with user_id extraction.
    """
    settings = get_settings()
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
        )

    provided_token = auth_header[7:]
    expected_token = derive_internal_token(settings.SECRET_KEY)

    # Phase 1: accept internal token as admin auth
    if hmac.compare_digest(provided_token, expected_token):
        return "system:internal"

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid admin token",
    )


InternalAuth = Annotated[None, Depends(verify_internal_token)]
AdminUser = Annotated[str, Depends(verify_admin_token)]
