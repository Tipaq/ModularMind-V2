"""Sync protocol — interface for config synchronization."""

from typing import Protocol


class SyncProtocol(Protocol):
    """Push-based sync from Studio to Engine."""

    async def push(self, payload: dict) -> dict: ...
    async def verify(self, checksum: str) -> bool: ...
