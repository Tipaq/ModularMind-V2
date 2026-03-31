"""Abstract base class for system connectors."""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.system_indexer.models import Relationship, StructuralUnit, SystemIndex


class BaseSystemConnector(ABC):
    """Contract for connectors that extract structure from external systems.

    Connectors produce StructuralUnits + Relationships.
    They do NOT know about Qdrant, PG, or the indexing pipeline.
    """

    @abstractmethod
    async def connect(self, config: dict) -> bool:
        """Establish connection to the target system. Return True on success."""
        ...

    @abstractmethod
    async def discover_structure(self) -> list[StructuralUnit]:
        """Extract all structural units (tables, endpoints, entities, etc.)."""
        ...

    @abstractmethod
    async def discover_relationships(self) -> list[Relationship]:
        """Extract relationships between structural units."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify the target system is reachable."""
        ...

    async def index(self, config: dict) -> SystemIndex:
        """Template method: connect → discover → return index."""
        connected = await self.connect(config)
        if not connected:
            msg = "Failed to connect to target system"
            raise ConnectionError(msg)

        units = await self.discover_structure()
        relationships = await self.discover_relationships()

        system_id = config.get("system_id", "unknown")
        for unit in units:
            unit.system_id = system_id

        return SystemIndex(
            system_id=system_id,
            units=units,
            relationships=relationships,
        )
