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

# Type alias for the two model classes that share an identical column schema.
type ConfigModel = type[AgentConfigVersion] | type[GraphConfigVersion]
type ConfigRow = AgentConfigVersion | GraphConfigVersion


class ConfigRepository:
    """Repository for versioned agent/graph config DB operations."""

    MAX_RETRIES = 3

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # -------------------------------------------------------------------
    # Generic helpers (private)
    # -------------------------------------------------------------------

    async def _create_version(
        self,
        model: ConfigModel,
        entity_id: str,
        config: dict[str, Any],
        label: str,
        created_by: str | None = None,
        change_note: str | None = None,
    ) -> ConfigRow:
        """Create a new version with auto-incremented version number.

        Acquires row-level locks via SELECT FOR UPDATE to serialize concurrent
        version creation. The new version is set as active and the previous
        active version is deactivated.

        For brand-new entities (no prior versions), an IntegrityError on PK
        means a concurrent CREATE race — raises IntegrityError (caller returns
        409). For existing entities, retries with next version on PK collision.
        """
        session = self._session

        # Lock all existing rows for this entity to prevent concurrent MAX reads
        existing = await session.execute(
            select(model).where(model.id == entity_id).with_for_update()
        )
        existing_rows = existing.scalars().all()
        is_new = len(existing_rows) == 0

        # Compute next version
        if existing_rows:
            max_version = max(r.version for r in existing_rows)
            next_version = max_version + 1
        else:
            next_version = 1

        # Deactivate current active version
        await session.execute(
            update(model)
            .where(
                model.id == entity_id,
                model.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        # Compute config_hash WITH version injected
        config_hash = compute_config_hash(config | {"version": next_version})

        # Extract name from config for denormalized column
        name = config.get("name", f"Unnamed {label.capitalize()}")

        row = model(
            id=entity_id,
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
                if is_new:
                    # Two concurrent CREATEs for the same brand-new entity
                    # Don't silently create version 2 — raise for 409
                    raise
                # Existing entity: PK collision from concurrent update race
                logger.warning(
                    "Version collision for %s %s v%d (attempt %d/%d): %s",
                    label,
                    entity_id,
                    next_version,
                    attempt + 1,
                    self.MAX_RETRIES,
                    e,
                )
                # Re-lock and recompute
                existing = await session.execute(
                    select(model).where(model.id == entity_id).with_for_update()
                )
                existing_rows = existing.scalars().all()
                max_version = max(r.version for r in existing_rows)
                next_version = max_version + 1

                await session.execute(
                    update(model)
                    .where(
                        model.id == entity_id,
                        model.is_active == True,  # noqa: E712
                    )
                    .values(is_active=False)
                )

                config_hash = compute_config_hash(config | {"version": next_version})
                row = model(
                    id=entity_id,
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
            f"Failed to create {label} version after {self.MAX_RETRIES} retries",
            params=None,
            orig=None,
        )

    async def _get_active(self, model: ConfigModel, entity_id: str) -> ConfigRow | None:
        """Get the active version of an entity."""
        result = await self._session.execute(
            select(model).where(
                model.id == entity_id,
                model.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def _list_active(self, model: ConfigModel) -> list[ConfigRow]:
        """List all active versions, ordered by name."""
        result = await self._session.execute(
            select(model)
            .where(model.is_active == True)  # noqa: E712
            .order_by(model.name)
        )
        return list(result.scalars().all())

    async def _get_versions(
        self,
        model: ConfigModel,
        entity_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ConfigRow], int]:
        """Get all versions of an entity, ordered by version DESC.

        Returns (versions, total_count).
        """
        count_result = await self._session.execute(
            select(func.count()).select_from(model).where(model.id == entity_id)
        )
        total = count_result.scalar_one()

        result = await self._session.execute(
            select(model)
            .where(model.id == entity_id)
            .order_by(model.version.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def _set_active_version(
        self,
        model: ConfigModel,
        entity_id: str,
        version: int,
        label: str,
    ) -> ConfigRow:
        """Set a specific version as active, deactivating the current one.

        Uses SELECT FOR UPDATE to serialize concurrent activations.
        Returns the newly activated version.
        Raises ValueError if entity or version not found.
        """
        session = self._session

        # Lock all rows for this entity
        result = await session.execute(select(model).where(model.id == entity_id).with_for_update())
        rows = {r.version: r for r in result.scalars().all()}

        if not rows:
            raise ValueError(f"{label.capitalize()} {entity_id} not found")
        if version not in rows:
            raise ValueError(f"Version {version} not found for {label} {entity_id}")

        # Deactivate current active
        await session.execute(
            update(model)
            .where(
                model.id == entity_id,
                model.is_active == True,  # noqa: E712
            )
            .values(is_active=False)
        )

        # Activate target version
        await session.execute(
            update(model)
            .where(
                model.id == entity_id,
                model.version == version,
            )
            .values(is_active=True)
        )

        await session.flush()

        # Refresh and return
        result = await session.execute(
            select(model).where(
                model.id == entity_id,
                model.version == version,
            )
        )
        return result.scalar_one()

    async def _delete_all_versions(self, model: ConfigModel, entity_id: str) -> None:
        """Delete ALL versions of an entity."""
        await self._session.execute(delete(model).where(model.id == entity_id))
        await self._session.flush()

    async def _bulk_import(
        self,
        model: ConfigModel,
        configs: list[dict],
        label: str,
    ) -> int:
        """Import configs as version 1 (active). Skips existing IDs.

        Returns the number of entities imported.
        """
        count = 0
        for config in configs:
            entity_id = str(config.get("id", ""))
            if not entity_id:
                logger.warning("Skipping %s config without id", label)
                continue

            existing = await self._session.execute(
                select(func.count()).select_from(model).where(model.id == entity_id)
            )
            if existing.scalar_one() > 0:
                logger.debug(
                    "%s %s already in DB, skipping import",
                    label.capitalize(),
                    entity_id,
                )
                continue

            # Strip version from config (version is the column)
            config_copy = {k: v for k, v in config.items() if k != "version"}
            config_hash = compute_config_hash(config_copy | {"version": 1})
            name = config_copy.get("name", f"Unnamed {label.capitalize()}")

            row = model(
                id=entity_id,
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

    async def _find_active_by_name(self, model: ConfigModel, name: str) -> ConfigRow | None:
        """Find an active config by exact name match."""
        result = await self._session.execute(
            select(model).where(
                model.is_active == True,  # noqa: E712
                model.name == name,
            )
        )
        return result.scalar_one_or_none()

    async def _has_any(self, model: ConfigModel) -> bool:
        """Check if any configs exist in DB for the given model."""
        result = await self._session.execute(select(func.count()).select_from(model))
        return result.scalar_one() > 0

    # -------------------------------------------------------------------
    # Agent operations
    # -------------------------------------------------------------------

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
        return await self._create_version(
            AgentConfigVersion,
            agent_id,
            config,
            "agent",
            created_by=created_by,
            change_note=change_note,
        )

    async def find_active_agent_by_name(self, name: str) -> AgentConfigVersion | None:
        """Find an active agent by exact name match."""
        return await self._find_active_by_name(AgentConfigVersion, name)

    async def get_active_agent(self, agent_id: str) -> AgentConfigVersion | None:
        """Get the active version of an agent."""
        return await self._get_active(AgentConfigVersion, agent_id)

    async def list_active_agents(self) -> list[AgentConfigVersion]:
        """List all active agent versions."""
        return await self._list_active(AgentConfigVersion)

    async def get_agent_versions(
        self,
        agent_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentConfigVersion], int]:
        """Get all versions of an agent, ordered by version DESC.

        Returns (versions, total_count).
        """
        return await self._get_versions(
            AgentConfigVersion,
            agent_id,
            limit=limit,
            offset=offset,
        )

    async def set_active_version(self, agent_id: str, version: int) -> AgentConfigVersion:
        """Set a specific version as active, deactivating the current one.

        Uses SELECT FOR UPDATE to serialize concurrent activations.
        Returns the newly activated version.
        Raises ValueError if version not found.
        """
        return await self._set_active_version(
            AgentConfigVersion,
            agent_id,
            version,
            "agent",
        )

    async def delete_agent(self, agent_id: str) -> None:
        """Delete ALL versions of an agent."""
        await self._delete_all_versions(AgentConfigVersion, agent_id)

    # -------------------------------------------------------------------
    # Graph operations (mirror of agent operations)
    # -------------------------------------------------------------------

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
        return await self._create_version(
            GraphConfigVersion,
            graph_id,
            config,
            "graph",
            created_by=created_by,
            change_note=change_note,
        )

    async def find_active_graph_by_name(self, name: str) -> GraphConfigVersion | None:
        """Find an active graph by exact name match."""
        return await self._find_active_by_name(GraphConfigVersion, name)

    async def get_active_graph(self, graph_id: str) -> GraphConfigVersion | None:
        """Get the active version of a graph."""
        return await self._get_active(GraphConfigVersion, graph_id)

    async def list_active_graphs(self) -> list[GraphConfigVersion]:
        """List all active graph versions."""
        return await self._list_active(GraphConfigVersion)

    async def get_graph_versions(
        self,
        graph_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[GraphConfigVersion], int]:
        """Get all versions of a graph, ordered by version DESC.

        Returns (versions, total_count).
        """
        return await self._get_versions(
            GraphConfigVersion,
            graph_id,
            limit=limit,
            offset=offset,
        )

    async def set_active_graph_version(self, graph_id: str, version: int) -> GraphConfigVersion:
        """Set a specific graph version as active."""
        return await self._set_active_version(
            GraphConfigVersion,
            graph_id,
            version,
            "graph",
        )

    async def delete_graph(self, graph_id: str) -> None:
        """Delete ALL versions of a graph."""
        await self._delete_all_versions(GraphConfigVersion, graph_id)

    # -------------------------------------------------------------------
    # Bulk operations (for seed/config import)
    # -------------------------------------------------------------------

    async def bulk_import_agents(self, configs: list[dict]) -> int:
        """Import agent configs as version 1 (active). Skips existing IDs.

        Returns the number of agents imported.
        """
        return await self._bulk_import(AgentConfigVersion, configs, "agent")

    async def bulk_import_graphs(self, configs: list[dict]) -> int:
        """Import graph configs as version 1 (active). Skips existing IDs.

        Returns the number of graphs imported.
        """
        return await self._bulk_import(GraphConfigVersion, configs, "graph")

    async def has_any_agents(self) -> bool:
        """Check if any agent configs exist in DB."""
        return await self._has_any(AgentConfigVersion)

    async def has_any_graphs(self) -> bool:
        """Check if any graph configs exist in DB."""
        return await self._has_any(GraphConfigVersion)
