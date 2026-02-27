"""Sync protocol — interface for pull-based config synchronization."""

from typing import Protocol


class SyncProtocol(Protocol):
    """Pull-based sync: Engine polls Platform for config updates."""

    async def poll(self) -> bool: ...
    async def apply_configs(self, configs: dict) -> None: ...
