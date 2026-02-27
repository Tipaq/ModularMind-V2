"""Runtime protocol — interface that Engine exposes for health and reporting."""

from typing import Protocol


class RuntimeProtocol(Protocol):
    """What Platform expects from an Engine instance (report endpoints)."""

    async def get_status(self) -> dict: ...
    async def get_metrics(self) -> dict: ...
    async def get_models(self) -> dict: ...
