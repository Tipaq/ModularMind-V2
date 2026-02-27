"""Protocol interfaces for memory operations."""

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field

from .models import MemoryScope, MemoryTier


class MemoryEntrySchema(BaseModel):
    """Pydantic schema for memory entries (data transfer)."""

    id: str
    scope: MemoryScope
    scope_id: str
    tier: MemoryTier = MemoryTier.BUFFER

    content: str

    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    access_count: int = 0
    last_accessed: datetime | None = None

    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class MemoryStats(BaseModel):
    """Statistics about memory for a scope."""

    total_entries: int
    entries_by_tier: dict[str, int]
    total_tokens: int | None = None
    oldest_entry: datetime | None = None
    newest_entry: datetime | None = None


@runtime_checkable
class IMemoryRepository(Protocol):
    """Protocol for memory repository operations."""

    async def create_entry(
        self,
        scope: MemoryScope,
        scope_id: str,
        content: str,
        embedding: list[float] | None = None,
        tier: MemoryTier = MemoryTier.BUFFER,
        metadata: dict | None = None,
        user_id: str | None = None,
        importance: float = 0.5,
    ) -> MemoryEntrySchema: ...

    async def get_entry(self, entry_id: str) -> MemoryEntrySchema | None: ...

    async def get_recent_entries(
        self,
        scope: MemoryScope,
        scope_id: str,
        limit: int = 10,
        tier: MemoryTier | None = None,
    ) -> list[MemoryEntrySchema]: ...

    async def search_hybrid(
        self,
        query_embedding: list[float],
        query_text: str,
        user_id: str,
        scope: MemoryScope | None = None,
        scope_id: str | None = None,
        limit: int = 10,
        threshold: float = 0.7,
    ) -> list[tuple[MemoryEntrySchema, float]]: ...

    async def update_access(self, entry_id: str) -> None: ...

    async def delete_entry(self, entry_id: str) -> bool: ...

    async def get_stats(self, scope: MemoryScope, scope_id: str) -> MemoryStats: ...
