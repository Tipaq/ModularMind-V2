"""
Migrate agents and graphs from Platform (Prisma DB) to Engine (domain_config DB).

Usage:
  python -m scripts.migrate_from_platform --platform-db <url> [--dry-run]

Connects to both PostgreSQL databases, reads agents/graphs from Platform's
Prisma tables, transforms to Engine format, and writes via ConfigRepository.
Idempotent: skips entities that already exist in Engine.
"""

import argparse
import asyncio
import json
import logging
from typing import Any

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain_config.repository import ConfigRepository
from src.infra.database import async_session_maker
from src.sync.service import _transform_agent, _transform_graph

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def fetch_platform_agents(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        "SELECT id, name, description, model, provider, config, version, tags "
        'FROM "Agent" ORDER BY "createdAt"'
    )
    agents = []
    for r in rows:
        config_raw = r["config"]
        config = json.loads(config_raw) if isinstance(config_raw, str) else (config_raw or {})
        agents.append(
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"] or "",
                "model": r["model"],
                "provider": r["provider"],
                "config": config,
                "version": r["version"],
                "tags": r["tags"] or [],
            }
        )
    return agents


async def fetch_platform_graphs(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        'SELECT id, name, description, nodes, edges, version FROM "Graph" ORDER BY "createdAt"'
    )
    graphs = []
    for r in rows:
        nodes_raw = r["nodes"]
        edges_raw = r["edges"]
        nodes = json.loads(nodes_raw) if isinstance(nodes_raw, str) else (nodes_raw or [])
        edges = json.loads(edges_raw) if isinstance(edges_raw, str) else (edges_raw or [])
        graphs.append(
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"] or "",
                "nodes": nodes,
                "edges": edges,
                "version": r["version"],
            }
        )
    return graphs


async def migrate_agents(
    platform_agents: list[dict[str, Any]],
    session: AsyncSession,
    dry_run: bool,
) -> int:
    repo = ConfigRepository(session)
    migrated = 0
    for raw in platform_agents:
        agent_id = raw["id"]
        existing = await repo.get_active_agent(agent_id)
        if existing:
            logger.info("  SKIP agent %s (%s) — already exists", agent_id, raw["name"])
            continue
        config = _transform_agent(raw)
        if dry_run:
            logger.info("  DRY-RUN: would migrate agent %s (%s)", agent_id, raw["name"])
        else:
            await repo.create_agent_version(
                agent_id, config, created_by="migration", change_note="Migrated from Platform"
            )
            logger.info("  MIGRATED agent %s (%s)", agent_id, raw["name"])
        migrated += 1
    return migrated


async def migrate_graphs(
    platform_graphs: list[dict[str, Any]],
    session: AsyncSession,
    dry_run: bool,
) -> int:
    repo = ConfigRepository(session)
    migrated = 0
    for raw in platform_graphs:
        graph_id = raw["id"]
        existing = await repo.get_active_graph(graph_id)
        if existing:
            logger.info("  SKIP graph %s (%s) — already exists", graph_id, raw["name"])
            continue
        config = _transform_graph(raw)
        if dry_run:
            logger.info("  DRY-RUN: would migrate graph %s (%s)", graph_id, raw["name"])
        else:
            await repo.create_graph_version(
                graph_id, config, created_by="migration", change_note="Migrated from Platform"
            )
            logger.info("  MIGRATED graph %s (%s)", graph_id, raw["name"])
        migrated += 1
    return migrated


async def main(platform_db_url: str, dry_run: bool) -> None:
    mode = "DRY RUN" if dry_run else "LIVE"
    logger.info("=== Platform → Engine Migration (%s) ===", mode)

    logger.info("Connecting to Platform DB...")
    platform_conn = await asyncpg.connect(platform_db_url)

    try:
        platform_agents = await fetch_platform_agents(platform_conn)
        platform_graphs = await fetch_platform_graphs(platform_conn)
        logger.info(
            "Found %d agents, %d graphs in Platform",
            len(platform_agents),
            len(platform_graphs),
        )
    finally:
        await platform_conn.close()

    if not platform_agents and not platform_graphs:
        logger.info("Nothing to migrate.")
        return

    async with async_session_maker() as session:
        logger.info("Migrating agents...")
        agents_migrated = await migrate_agents(platform_agents, session, dry_run)

        logger.info("Migrating graphs...")
        graphs_migrated = await migrate_graphs(platform_graphs, session, dry_run)

        if not dry_run:
            await session.commit()

    logger.info("=== Migration complete ===")
    logger.info("  Agents: %d migrated", agents_migrated)
    logger.info("  Graphs: %d migrated", graphs_migrated)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate agents/graphs from Platform to Engine")
    parser.add_argument(
        "--platform-db",
        required=True,
        help="Platform PostgreSQL URL (e.g. postgresql://user:pass@host:5432/platform)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    asyncio.run(main(args.platform_db, args.dry_run))
