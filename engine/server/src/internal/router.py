"""
Internal router.

Internal API endpoints protected by admin authentication.
Sub-routers handle monitoring, actions, logs, alerts, settings, providers, and playground.
"""

import logging
import time

import psutil
import sqlalchemy.exc
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from src.auth import CurrentUser, RequireAdmin
from src.auth.models import User, UserRole
from src.domain_config import get_config_provider
from src.infra.constants import RATE_LIMIT_INTERNAL
from src.infra.database import DbSession
from src.infra.rate_limit import RateLimitDependency

# Sub-routers
from src.internal import (
    actions,
    alerts,
    github_tokens,
    logs,
    monitoring,
    pipelines,
    playground,
    providers,
    settings,
    supervisor_layers,
)
from src.internal.auth import verify_internal_token
from src.internal.schemas import UserSyncRequest

logger = logging.getLogger(__name__)

_reload_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_INTERNAL)
_sync_rate_limit = RateLimitDependency(requests_per_minute=RATE_LIMIT_INTERNAL)

router = APIRouter(tags=["Internal"])

# Track startup time for uptime calculation
_start_time = time.time()

# Share startup time with monitoring module
monitoring.set_start_time(_start_time)

# Include sub-routers
router.include_router(monitoring.router)
router.include_router(actions.router)
router.include_router(logs.router)
router.include_router(alerts.router)
router.include_router(settings.router)
router.include_router(providers.router)
router.include_router(playground.router)
router.include_router(supervisor_layers.router)
router.include_router(pipelines.router)
router.include_router(github_tokens.router)


# ==================== Core Endpoints ====================


@router.post("/reload", dependencies=[Depends(_reload_rate_limit)])
async def reload_config(request: Request) -> dict:
    """Reload agent and graph configurations.

    This endpoint is called by the sync service when configurations
    are updated. Protected by HMAC-derived internal token.
    """
    verify_internal_token(request)

    client_ip = request.client.host if request.client else "unknown"
    logger.info("Config reload triggered from %s", client_ip)

    provider = get_config_provider()
    await provider.reload_async()

    agents = await provider.list_agents()
    graphs = await provider.list_graphs()

    logger.info("Config reloaded: %d agents, %d graphs", len(agents), len(graphs))

    return {
        "status": "reloaded",
        "agents": len(agents),
        "graphs": len(graphs),
    }


# ==================== Config Import ====================


@router.post("/import-configs", dependencies=[Depends(_reload_rate_limit)])
async def import_configs(request: Request, db: DbSession) -> dict:
    """One-time import of YAML configs from disk into the versioned DB.

    Protected by HMAC-derived internal token. Skips configs already in DB.
    """
    verify_internal_token(request)

    from pathlib import Path

    import yaml

    from src.domain_config.repository import ConfigRepository
    from src.infra.config import get_settings

    settings = get_settings()
    config_dir = Path(settings.CONFIG_DIR)
    repo = ConfigRepository(db)

    agents_imported = 0
    graphs_imported = 0
    skipped = 0

    # Import agents
    agents_dir = config_dir / "agents"
    if agents_dir.exists():
        for f in agents_dir.glob("*.yaml"):
            try:
                with open(f) as fh:
                    data = yaml.safe_load(fh)
                if not data or not isinstance(data, dict):
                    continue
                agent_id = str(data.get("id", ""))
                if not agent_id:
                    continue
                existing = await repo.get_active_agent(agent_id)
                if existing:
                    skipped += 1
                    continue
                config_copy = {k: v for k, v in data.items() if k != "version"}
                await repo.create_agent_version(agent_id, config_copy)
                agents_imported += 1
            except (OSError, yaml.YAMLError, sqlalchemy.exc.SQLAlchemyError) as e:
                logger.error("Failed to import agent from %s: %s", f, e)

    # Import graphs
    graphs_dir = config_dir / "graphs"
    if graphs_dir.exists():
        for f in graphs_dir.glob("*.yaml"):
            try:
                with open(f) as fh:
                    data = yaml.safe_load(fh)
                if not data or not isinstance(data, dict):
                    continue
                graph_id = str(data.get("id", ""))
                if not graph_id:
                    continue
                existing = await repo.get_active_graph(graph_id)
                if existing:
                    skipped += 1
                    continue
                config_copy = {k: v for k, v in data.items() if k != "version"}
                await repo.create_graph_version(graph_id, config_copy)
                graphs_imported += 1
            except (OSError, yaml.YAMLError, sqlalchemy.exc.SQLAlchemyError) as e:
                logger.error("Failed to import graph from %s: %s", f, e)

    logger.info(
        "Config import: %d agents, %d graphs imported, %d skipped",
        agents_imported,
        graphs_imported,
        skipped,
    )

    return {
        "agents_imported": agents_imported,
        "graphs_imported": graphs_imported,
        "skipped": skipped,
    }


# ==================== User Sync ====================


@router.post("/users/sync", dependencies=[Depends(_sync_rate_limit)])
async def sync_users(request: Request, body: UserSyncRequest, db: DbSession) -> dict:
    """Upsert users from platform sync.

    Protected by HMAC-derived internal token (same as /reload).
    Called by platform sync after fetching config.
    """
    verify_internal_token(request)

    synced_platform_ids: set[str] = set()
    created = 0
    updated = 0
    deactivated = 0

    for item in body.users:
        synced_platform_ids.add(item.id)

        # Try to find existing user by platform_user_id
        result = await db.execute(select(User).where(User.platform_user_id == item.id))
        existing = result.scalar_one_or_none()

        # Fallback: match by email (handles initial migration of CLI users)
        if not existing:
            result = await db.execute(select(User).where(User.email == item.email))
            existing = result.scalar_one_or_none()

        role = UserRole(item.role)

        if existing:
            changed = False
            if existing.hashed_password != item.hashed_password:
                existing.hashed_password = item.hashed_password
                changed = True
            if existing.role != role:
                existing.role = role
                changed = True
            if existing.is_active != item.is_active:
                existing.is_active = item.is_active
                changed = True
            if existing.email != item.email:
                existing.email = item.email
                changed = True
            # Link to platform if not yet linked
            if existing.platform_user_id != item.id:
                existing.platform_user_id = item.id
                changed = True
            if changed:
                updated += 1
        else:
            # Create new user using the platform UUID as local ID
            new_user = User(
                id=item.id,
                email=item.email,
                hashed_password=item.hashed_password,
                role=role,
                is_active=item.is_active,
                platform_user_id=item.id,
            )
            db.add(new_user)
            created += 1

    # Deactivate platform-synced users not in the current list.
    # Users without platform_user_id (CLI-created) are never touched.
    if synced_platform_ids:
        result = await db.execute(
            select(User).where(
                User.platform_user_id.isnot(None),
                User.is_active,
                User.platform_user_id.notin_(synced_platform_ids),
            )
        )
    else:
        # No users synced — deactivate ALL platform users
        result = await db.execute(
            select(User).where(
                User.platform_user_id.isnot(None),
                User.is_active,
            )
        )
    for orphan in result.scalars().all():
        orphan.is_active = False
        deactivated += 1

    await db.commit()

    logger.info(
        "User sync: %d created, %d updated, %d deactivated",
        created,
        updated,
        deactivated,
    )

    return {
        "status": "ok",
        "created": created,
        "updated": updated,
        "deactivated": deactivated,
    }


# ==================== Status ====================


@router.get("/status", dependencies=[RequireAdmin])
async def internal_status(user: CurrentUser) -> dict:
    """Get runtime status for dashboard display."""
    return {
        "status": "healthy",
        "uptime_seconds": int(time.time() - _start_time),
        "version": "0.1.0",
        "last_sync_at": None,
        "sync_status": "synced",
    }


@router.get("/metrics", dependencies=[RequireAdmin])
async def internal_metrics(user: CurrentUser) -> dict:
    """Get runtime metrics for dashboard display."""
    process = psutil.Process()
    memory_mb = process.memory_info().rss / (1024 * 1024)

    return {
        "executions_24h": 0,
        "avg_execution_time_ms": 0,
        "error_rate": 0.0,
        "tokens_consumed_24h": 0,
        "memory_usage_mb": round(memory_mb, 1),
        "active_sessions": 0,
    }
