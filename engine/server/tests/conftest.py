"""
Test fixtures for ModularMind Engine.

Requires PostgreSQL (CI services or docker-compose.dev.yml).
DATABASE_URL env var must point to the test database.
"""

import os
from uuid import uuid4

# Set env vars BEFORE importing any src module
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/modularmind_test",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.auth.models import User, UserRole
from src.infra.database import Base, get_db, get_db_readonly

# ---------------------------------------------------------------------------
# Test database
# ---------------------------------------------------------------------------

_engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
_Session = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    """Create all tables once; drop after the session."""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


# ---------------------------------------------------------------------------
# User factories
# ---------------------------------------------------------------------------


def make_user(role: UserRole = UserRole.USER, **kw) -> User:
    """Create a User instance with a unique ID (not yet persisted)."""
    uid = str(uuid4())
    return User(
        id=kw.pop("id", uid),
        email=kw.pop("email", f"{uid[:8]}@test.com"),
        hashed_password="not-a-real-hash",
        role=role,
        is_active=kw.pop("is_active", True),
        **kw,
    )


@pytest.fixture
def user():
    return make_user(UserRole.USER)


@pytest.fixture
def admin():
    return make_user(UserRole.ADMIN)


@pytest.fixture
def owner():
    return make_user(UserRole.OWNER)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def persist_user(u: User) -> None:
    """Insert a user into the test DB (idempotent)."""
    async with _Session() as s:
        if not await s.get(User, u.id):
            s.add(u)
            await s.commit()


def _build_app(current_user: User, groups: list[str] | None = None):
    """Create a fresh FastAPI app with auth + DB overrides."""
    from fastapi import FastAPI

    from src.auth.dependencies import get_current_user, get_current_user_groups

    app = FastAPI()

    # DB dependency overrides
    async def _db():
        async with _Session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _db_ro():
        async with _Session() as session:
            yield session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_db_readonly] = _db_ro
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_current_user_groups] = lambda: groups or []

    # Mount routers (same prefix structure as main.py)
    P = "/api/v1"
    from src.conversations.router import admin_router as conv_admin_r
    from src.conversations.router import router as conv_r
    from src.groups.router import router as groups_r
    from src.health.router import router as health_r

    app.include_router(health_r)
    app.include_router(conv_r, prefix=P)
    app.include_router(conv_admin_r, prefix=f"{P}/admin")
    app.include_router(groups_r, prefix=P)

    return app


# ---------------------------------------------------------------------------
# Authenticated HTTP clients
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(user):
    """Async HTTP client authenticated as a regular user."""
    await persist_user(user)
    app = _build_app(user)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.test_user = user  # attach for assertions
        yield c


@pytest_asyncio.fixture
async def admin_client(admin):
    """Async HTTP client authenticated as an admin."""
    await persist_user(admin)
    app = _build_app(admin)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.test_user = admin
        yield c


@pytest_asyncio.fixture
async def owner_client(owner):
    """Async HTTP client authenticated as an owner."""
    await persist_user(owner)
    app = _build_app(owner)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.test_user = owner
        yield c
