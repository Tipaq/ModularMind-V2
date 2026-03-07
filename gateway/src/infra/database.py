"""Database configuration and session management for Gateway.

Uses SQLAlchemy 2.0 async with PostgreSQL (asyncpg driver).
Shares the same database as the engine.
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from src.config import get_settings

settings = get_settings()

_engine_kwargs: dict = {"echo": False}
if "sqlite" not in settings.DATABASE_URL:
    _engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_pre_ping=settings.DB_POOL_PRE_PING,
        connect_args={
            "timeout": settings.DB_CONNECT_TIMEOUT,
            "command_timeout": settings.DB_COMMAND_TIMEOUT,
        },
    )

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for Gateway SQLAlchemy models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_db_readonly() -> AsyncGenerator[AsyncSession, None]:
    """Read-only database session that never commits."""
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


DbReadOnly = Annotated[AsyncSession, Depends(get_db_readonly)]


def utcnow() -> datetime:
    """Return current UTC datetime (naive, matching TIMESTAMP WITHOUT TIME ZONE columns)."""
    return datetime.now(UTC).replace(tzinfo=None)


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
