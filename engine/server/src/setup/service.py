"""Setup wizard service."""

import logging
from datetime import UTC, datetime
from pathlib import Path

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User, UserRole
from src.auth.schemas import UserCreate
from src.auth.service import AuthService

logger = logging.getLogger(__name__)

# Default model per provider (same as old cli.py _DEFAULT_MODELS but simplified)
_PROVIDER_DEFAULT_MODEL = {
    "openai": "openai:gpt-4o",
    "anthropic": "anthropic:claude-sonnet-4-5-20250929",
    "ollama": "ollama:qwen3:8b",
}


async def is_initialized(db: AsyncSession) -> bool:
    """Check if at least one owner user exists."""
    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(
            User.role == UserRole.OWNER,
            User.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one() > 0


async def initialize_runtime(
    db: AsyncSession,
    email: str,
    password: str,
    runtime_name: str,
    default_provider: str,
    config_dir: str,
) -> User:
    """Create the first owner user and write manifest.yaml.

    Raises ValueError if already initialized or password is weak.
    """
    if await is_initialized(db):
        raise ValueError("Runtime is already initialized")

    # Create owner user (AuthService validates password strength via flush)
    auth_service = AuthService(db)
    user = await auth_service.create_user(
        UserCreate(
            email=email,
            password=password,
            role=UserRole.OWNER,
        )
    )

    # CRITICAL: create_user() only calls flush(), we must commit the transaction
    await db.commit()

    # Write manifest.yaml
    base = Path(config_dir)
    base.mkdir(parents=True, exist_ok=True)

    manifest = {
        "name": runtime_name,
        "version": "1.0.0",
        "created": datetime.now(UTC).isoformat(),
        "description": f"ModularMind runtime for {runtime_name}",
        "default_model": _PROVIDER_DEFAULT_MODEL.get(
            default_provider, f"{default_provider}:default"
        ),
    }

    manifest_path = base / "manifest.yaml"
    manifest_path.write_text(
        yaml.dump(manifest, default_flow_style=False, allow_unicode=True, sort_keys=False)
    )

    logger.info("Runtime initialized: name=%s, admin=%s", runtime_name, email)
    return user
