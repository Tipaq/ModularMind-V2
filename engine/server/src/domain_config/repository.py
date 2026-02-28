"""
Config repository for versioned agent/graph configurations.

Provides async CRUD operations on AgentConfigVersion and GraphConfigVersion
tables with row-level locking to prevent race conditions.
"""

import logging
from typing import Any

from modularmind_shared.utils import compute_config_hash
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AgentConfigVersion, GraphConfigVersion

logger = logging.getLogger(__name__)


class ConfigRepository:
    """Repository for versioned agent/graph config DB operations."""

    MAX_RETRIES = 3

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # -----------------------------------------------------------------------
    # Agent operations
    # -----------------------------------------------------------------------

    async def create_agent_version(
        self,
        agent_id: str,
        config: dict[str, Any],
        created_by: str | None = None,
        change_note: str | None = None,
    ) -> AgentConfigVersion:
        """Create a new agent version with auto-incremented version number.

        Acquires row-level locks via SELECT FOR UPDATE to serialize concurrent
        version creation. The new version is set as active and the previous
        active version is deactivated.

        For brand-new agents (no prior versions), an IntegrityError on PK means
        a concurrent CREATE race — raises IntegrityError (caller returns 409).
        For existing agents, retries with next version on PK collision.
        """
        session = self._session

        # Lock all existing rows for this agent to prevent concurrent MAX reads
        existing = await session.execute(
            select(AgentConfigVersion)
            .where(AgentConfigVersion.id == agent_id)
            .with_for_update()
        )
        existing_rows = existing.scalars().all()
        is_new_agent = len(existing_rows) == 0

        # Compute next version
        if existing_rows:
            max_version = max(r.version for r in existing_rows)
            next_version = max_version + 1
        else:
            next_version = 1

        # Deactivate current active version
        await session.execute(
            update(AgentConfigVersion)
            .where(
                AgentConfigVersion.id == agent_id,
                AgentConfigVersion.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        # Compute config_hash WITH version injected
        config_hash = compute_config_hash(config | {"version": next_version})

        # Extract name from config for denormalized column
        name = config.get("name", "Unnamed Agent")

        row = AgentConfigVersion(
            id=agent_id,
            version=next_version,
            name=name,
            config=config,
            config_hash=config_hash,
            is_active=True,
            created_by=created_by,
            change_note=change_note,
        )
        session.add(row)

        for attempt in range(self.MAX_RETRIES):
            try:
                await session.flush()
                return row
            except IntegrityError as e:
                await session.rollback()
                if is_new_agent:
                    # Two concurrent CREATEs for the same brand-new agent
                    # Don't silently create version 2 — raise for 409
                    raise
                # Existing agent: PK collision from concurrent update race
                logger.warning(
                    "Version collision for agent %s v%d (attempt %d/%d): %s",
                    agent_id,
                    next_version,
                    attempt + 1,
                    self.MAX_RETRIES,
                    e,
                )
                # Re-lock and recompute
                existing = await session.execute(
                    select(AgentConfigVersion)
                    .where(AgentConfigVersion.id == agent_id)
                    .with_for_update()
                )
                existing_rows = existing.scalars().all()
                max_version = max(r.version for r in existing_rows)
                next_version = max_version + 1

                await session.execute(
                    update(AgentConfigVersion)
                    .where(
                        AgentConfigVersion.id == agent_id,
                        AgentConfigVersion.is_active == True,  # noqa: E712
                    )
                    .values(is_active=False)
                )

                config_hash = compute_config_hash(
                    config | {"version": next_version}
                )
                row = AgentConfigVersion(
                    id=agent_id,
                    version=next_version,
                    name=name,
                    config=config,
                    config_hash=config_hash,
                    is_active=True,
                    created_by=created_by,
                    change_note=change_note,
                )
                session.add(row)

        # Exhausted retries
        raise IntegrityError(
            f"Failed to create agent version after {self.MAX_RETRIES} retries",
            params=None,
            orig=None,
        )

    async def get_active_agent(
        self, agent_id: str
    ) -> AgentConfigVersion | None:
        """Get the active version of an agent."""
        result = await self._session.execute(
            select(AgentConfigVersion).where(
                AgentConfigVersion.id == agent_id,
                AgentConfigVersion.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_active_agents(self) -> list[AgentConfigVersion]:
        """List all active agent versions."""
        result = await self._session.execute(
            select(AgentConfigVersion)
            .where(AgentConfigVersion.is_active == True)  # noqa: E712
            .order_by(AgentConfigVersion.name)
        )
        return list(result.scalars().all())

    async def get_agent_versions(
        self,
        agent_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentConfigVersion], int]:
        """Get all versions of an agent, ordered by version DESC.

        Returns (versions, total_count).
        """
        # Total count
        count_result = await self._session.execute(
            select(func.count())
            .select_from(AgentConfigVersion)
            .where(AgentConfigVersion.id == agent_id)
        )
        total = count_result.scalar_one()

        # Paginated results
        result = await self._session.execute(
            select(AgentConfigVersion)
            .where(AgentConfigVersion.id == agent_id)
            .order_by(AgentConfigVersion.version.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def set_active_version(
        self, agent_id: str, version: int
    ) -> AgentConfigVersion:
        """Set a specific version as active, deactivating the current one.

        Uses SELECT FOR UPDATE to serialize concurrent activations.
        Returns the newly activated version.
        Raises ValueError if version not found.
        """
        session = self._session

        # Lock all rows for this agent
        result = await session.execute(
            select(AgentConfigVersion)
            .where(AgentConfigVersion.id == agent_id)
            .with_for_update()
        )
        rows = {r.version: r for r in result.scalars().all()}

        if not rows:
            raise ValueError(f"Agent {agent_id} not found")
        if version not in rows:
            raise ValueError(
                f"Version {version} not found for agent {agent_id}"
            )

        # Deactivate current active
        await session.execute(
            update(AgentConfigVersion)
            .where(
                AgentConfigVersion.id == agent_id,
                AgentConfigVersion.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        # Activate target version
        await session.execute(
            update(AgentConfigVersion)
            .where(
                AgentConfigVersion.id == agent_id,
                AgentConfigVersion.version == version,
            )
            .values(is_active=True)
        )

        await session.flush()

        # Refresh and return
        result = await session.execute(
            select(AgentConfigVersion).where(
                AgentConfigVersion.id == agent_id,
                AgentConfigVersion.version == version,
            )
        )
        return result.scalar_one()

    async def delete_agent(self, agent_id: str) -> None:
        """Delete ALL versions of an agent."""
        await self._session.execute(
            delete(AgentConfigVersion).where(
                AgentConfigVersion.id == agent_id
            )
        )
        await self._session.flush()

    # -----------------------------------------------------------------------
    # Graph operations (mirror of agent operations)
    # -----------------------------------------------------------------------

    async def create_graph_version(
        self,
        graph_id: str,
        config: dict[str, Any],
        created_by: str | None = None,
        change_note: str | None = None,
    ) -> GraphConfigVersion:
        """Create a new graph version with auto-incremented version number.

        Same locking and retry semantics as create_agent_version.
        """
        session = self._session

        existing = await session.execute(
            select(GraphConfigVersion)
            .where(GraphConfigVersion.id == graph_id)
            .with_for_update()
        )
        existing_rows = existing.scalars().all()
        is_new_graph = len(existing_rows) == 0

        if existing_rows:
            max_version = max(r.version for r in existing_rows)
            next_version = max_version + 1
        else:
            next_version = 1

        await session.execute(
            update(GraphConfigVersion)
            .where(
                GraphConfigVersion.id == graph_id,
                GraphConfigVersion.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        config_hash = compute_config_hash(config | {"version": next_version})
        name = config.get("name", "Unnamed Graph")

        row = GraphConfigVersion(
            id=graph_id,
            version=next_version,
            name=name,
            config=config,
            config_hash=config_hash,
            is_active=True,
            created_by=created_by,
            change_note=change_note,
        )
        session.add(row)

        for attempt in range(self.MAX_RETRIES):
            try:
                await session.flush()
                return row
            except IntegrityError as e:
                await session.rollback()
                if is_new_graph:
                    raise
                logger.warning(
                    "Version collision for graph %s v%d (attempt %d/%d): %s",
                    graph_id,
                    next_version,
                    attempt + 1,
                    self.MAX_RETRIES,
                    e,
                )
                existing = await session.execute(
                    select(GraphConfigVersion)
                    .where(GraphConfigVersion.id == graph_id)
                    .with_for_update()
                )
                existing_rows = existing.scalars().all()
                max_version = max(r.version for r in existing_rows)
                next_version = max_version + 1

                await session.execute(
                    update(GraphConfigVersion)
                    .where(
                        GraphConfigVersion.id == graph_id,
                        GraphConfigVersion.is_active == True,  # noqa: E712
                    )
                    .values(is_active=False)
                )

                config_hash = compute_config_hash(
                    config | {"version": next_version}
                )
                row = GraphConfigVersion(
                    id=graph_id,
                    version=next_version,
                    name=name,
                    config=config,
                    config_hash=config_hash,
                    is_active=True,
                    created_by=created_by,
                    change_note=change_note,
                )
                session.add(row)

        raise IntegrityError(
            f"Failed to create graph version after {self.MAX_RETRIES} retries",
            params=None,
            orig=None,
        )

    async def get_active_graph(
        self, graph_id: str
    ) -> GraphConfigVersion | None:
        """Get the active version of a graph."""
        result = await self._session.execute(
            select(GraphConfigVersion).where(
                GraphConfigVersion.id == graph_id,
                GraphConfigVersion.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_active_graphs(self) -> list[GraphConfigVersion]:
        """List all active graph versions."""
        result = await self._session.execute(
            select(GraphConfigVersion)
            .where(GraphConfigVersion.is_active == True)  # noqa: E712
            .order_by(GraphConfigVersion.name)
        )
        return list(result.scalars().all())

    async def get_graph_versions(
        self,
        graph_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[GraphConfigVersion], int]:
        """Get all versions of a graph, ordered by version DESC.

        Returns (versions, total_count).
        """
        count_result = await self._session.execute(
            select(func.count())
            .select_from(GraphConfigVersion)
            .where(GraphConfigVersion.id == graph_id)
        )
        total = count_result.scalar_one()

        result = await self._session.execute(
            select(GraphConfigVersion)
            .where(GraphConfigVersion.id == graph_id)
            .order_by(GraphConfigVersion.version.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def set_active_graph_version(
        self, graph_id: str, version: int
    ) -> GraphConfigVersion:
        """Set a specific graph version as active."""
        session = self._session

        result = await session.execute(
            select(GraphConfigVersion)
            .where(GraphConfigVersion.id == graph_id)
            .with_for_update()
        )
        rows = {r.version: r for r in result.scalars().all()}

        if not rows:
            raise ValueError(f"Graph {graph_id} not found")
        if version not in rows:
            raise ValueError(
                f"Version {version} not found for graph {graph_id}"
            )

        await session.execute(
            update(GraphConfigVersion)
            .where(
                GraphConfigVersion.id == graph_id,
                GraphConfigVersion.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        await session.execute(
            update(GraphConfigVersion)
            .where(
                GraphConfigVersion.id == graph_id,
                GraphConfigVersion.version == version,
            )
            .values(is_active=True)
        )

        await session.flush()

        result = await session.execute(
            select(GraphConfigVersion).where(
                GraphConfigVersion.id == graph_id,
                GraphConfigVersion.version == version,
            )
        )
        return result.scalar_one()

    async def delete_graph(self, graph_id: str) -> None:
        """Delete ALL versions of a graph."""
        await self._session.execute(
            delete(GraphConfigVersion).where(
                GraphConfigVersion.id == graph_id
            )
        )
        await self._session.flush()

    # -----------------------------------------------------------------------
    # Bulk operations (for seed/config import)
    # -----------------------------------------------------------------------

    async def bulk_import_agents(self, configs: list[dict]) -> int:
        """Import agent configs as version 1 (active). Skips existing IDs.

        Returns the number of agents imported.
        """
        count = 0
        for config in configs:
            agent_id = str(config.get("id", ""))
            if not agent_id:
                logger.warning("Skipping agent config without id")
                continue

            # Check if already exists
            existing = await self._session.execute(
                select(func.count())
                .select_from(AgentConfigVersion)
                .where(AgentConfigVersion.id == agent_id)
            )
            if existing.scalar_one() > 0:
                logger.debug("Agent %s already in DB, skipping import", agent_id)
                continue

            # Strip version from config (version is the column)
            config_copy = {k: v for k, v in config.items() if k != "version"}
            config_hash = compute_config_hash(config_copy | {"version": 1})
            name = config_copy.get("name", "Unnamed Agent")

            row = AgentConfigVersion(
                id=agent_id,
                version=1,
                name=name,
                config=config_copy,
                config_hash=config_hash,
                is_active=True,
                change_note="Initial import",
            )
            self._session.add(row)
            count += 1

        if count > 0:
            await self._session.flush()
        return count

    async def bulk_import_graphs(self, configs: list[dict]) -> int:
        """Import graph configs as version 1 (active). Skips existing IDs.

        Returns the number of graphs imported.
        """
        count = 0
        for config in configs:
            graph_id = str(config.get("id", ""))
            if not graph_id:
                logger.warning("Skipping graph config without id")
                continue

            existing = await self._session.execute(
                select(func.count())
                .select_from(GraphConfigVersion)
                .where(GraphConfigVersion.id == graph_id)
            )
            if existing.scalar_one() > 0:
                logger.debug("Graph %s already in DB, skipping import", graph_id)
                continue

            config_copy = {k: v for k, v in config.items() if k != "version"}
            config_hash = compute_config_hash(config_copy | {"version": 1})
            name = config_copy.get("name", "Unnamed Graph")

            row = GraphConfigVersion(
                id=graph_id,
                version=1,
                name=name,
                config=config_copy,
                config_hash=config_hash,
                is_active=True,
                change_note="Initial import",
            )
            self._session.add(row)
            count += 1

        if count > 0:
            await self._session.flush()
        return count

    async def has_any_agents(self) -> bool:
        """Check if any agent configs exist in DB."""
        result = await self._session.execute(
            select(func.count()).select_from(AgentConfigVersion)
        )
        return result.scalar_one() > 0

    async def has_any_graphs(self) -> bool:
        """Check if any graph configs exist in DB."""
        result = await self._session.execute(
            select(func.count()).select_from(GraphConfigVersion)
        )
        return result.scalar_one() > 0
