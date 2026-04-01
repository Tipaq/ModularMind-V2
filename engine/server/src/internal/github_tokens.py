"""GitHub token CRUD endpoints for the internal admin API."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from src.auth import RequireOwner
from src.infra.database import DbSession
from src.infra.secrets import get_secrets_store
from src.tools.models import GitHubToken

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github-tokens", tags=["GitHub Tokens"])


class GitHubTokenCreate(BaseModel):
    label: str = Field(..., max_length=100)
    token: str = Field(..., min_length=1)
    scopes: list[str] = Field(default_factory=list)
    is_default: bool = False


class GitHubTokenUpdate(BaseModel):
    label: str | None = None
    scopes: list[str] | None = None
    is_default: bool | None = None


class GitHubTokenResponse(BaseModel):
    id: str
    label: str
    token_preview: str
    scopes: list[str]
    is_default: bool
    created_at: str
    updated_at: str


@router.get("", response_model=list[GitHubTokenResponse], dependencies=[RequireOwner])
async def list_tokens(db: DbSession) -> list[GitHubTokenResponse]:
    """List all GitHub tokens (token values masked)."""
    result = await db.execute(select(GitHubToken).order_by(GitHubToken.created_at.desc()))
    tokens = result.scalars().all()
    return [_to_response(t) for t in tokens]


@router.post("", response_model=GitHubTokenResponse, status_code=201, dependencies=[RequireOwner])
async def create_token(body: GitHubTokenCreate, db: DbSession) -> GitHubTokenResponse:
    """Add a new GitHub token."""
    store = get_secrets_store()
    token = GitHubToken(
        id=str(uuid4()),
        label=body.label,
        token_encrypted=store.encrypt_value(body.token),
        scopes=body.scopes,
        is_default=body.is_default,
    )

    if body.is_default:
        await _clear_defaults(db)

    db.add(token)
    await db.flush()
    logger.info("GitHub token created: %s (%s)", token.label, token.id)
    return _to_response(token)


@router.patch("/{token_id}", response_model=GitHubTokenResponse, dependencies=[RequireOwner])
async def update_token(
    token_id: str,
    body: GitHubTokenUpdate,
    db: DbSession,
) -> GitHubTokenResponse:
    """Update a GitHub token's metadata."""
    result = await db.execute(select(GitHubToken).where(GitHubToken.id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    if body.label is not None:
        token.label = body.label
    if body.scopes is not None:
        token.scopes = body.scopes
    if body.is_default is not None:
        if body.is_default:
            await _clear_defaults(db)
        token.is_default = body.is_default

    await db.flush()
    return _to_response(token)


@router.delete("/{token_id}", status_code=204, dependencies=[RequireOwner])
async def delete_token(token_id: str, db: DbSession) -> None:
    """Remove a GitHub token."""
    result = await db.execute(select(GitHubToken).where(GitHubToken.id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    await db.delete(token)
    logger.info("GitHub token deleted: %s (%s)", token.label, token.id)


async def _clear_defaults(db: DbSession) -> None:
    """Unset is_default on all tokens."""
    await db.execute(
        update(GitHubToken).where(GitHubToken.is_default.is_(True)).values(is_default=False)
    )


def _to_response(token: GitHubToken) -> GitHubTokenResponse:
    """Convert model to response with masked token."""
    store = get_secrets_store()
    try:
        raw = store.decrypt_value(token.token_encrypted)
    except Exception:
        raw = token.token_encrypted
    preview = f"ghp_{'•' * 8}{raw[-4:]}" if len(raw) > 4 else "••••"
    return GitHubTokenResponse(
        id=token.id,
        label=token.label,
        token_preview=preview,
        scopes=token.scopes or [],
        is_default=token.is_default,
        created_at=token.created_at.isoformat() if token.created_at else "",
        updated_at=token.updated_at.isoformat() if token.updated_at else "",
    )
