"""User secrets model and service."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.database import Base

MAX_SECRETS_PER_USER = 20
MASK_VISIBLE_CHARS = 4


class UserSecret(Base):
    __tablename__ = "user_secrets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _mask_value(value: str) -> str:
    if len(value) <= MASK_VISIBLE_CHARS:
        return "****"
    return "****" + value[-MASK_VISIBLE_CHARS:]


class UserSecretService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_secrets(self, user_id: str) -> list[dict]:
        result = await self.db.execute(
            select(UserSecret).where(UserSecret.user_id == user_id).order_by(UserSecret.created_at)
        )
        return [
            {
                "key": s.key,
                "label": s.label,
                "masked_value": _mask_value(s.encrypted_value),
                "created_at": s.created_at.isoformat() if s.created_at else "",
            }
            for s in result.scalars().all()
        ]

    async def add_secret(self, user_id: str, key: str, label: str, value: str) -> dict:
        count_result = await self.db.execute(
            select(func.count()).select_from(UserSecret).where(UserSecret.user_id == user_id)
        )
        if (count_result.scalar() or 0) >= MAX_SECRETS_PER_USER:
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail="Maximum secrets limit reached")

        existing = await self.db.execute(
            select(UserSecret).where(UserSecret.user_id == user_id, UserSecret.key == key)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException

            raise HTTPException(status_code=409, detail=f"Secret '{key}' already exists")

        secret = UserSecret(user_id=user_id, key=key, label=label, encrypted_value=value)
        self.db.add(secret)
        await self.db.commit()
        return {
            "key": secret.key,
            "label": secret.label,
            "masked_value": _mask_value(value),
            "created_at": "",
        }

    async def delete_secret(self, user_id: str, key: str) -> None:
        result = await self.db.execute(
            select(UserSecret).where(UserSecret.user_id == user_id, UserSecret.key == key)
        )
        secret = result.scalar_one_or_none()
        if not secret:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Secret not found")
        await self.db.delete(secret)
        await self.db.commit()
