"""Runtime protocol — interface that Engine exposes to Studio."""

from typing import Protocol


class RuntimeProtocol(Protocol):
    """What Studio expects from an Engine instance."""

    async def push_config(self, payload: dict) -> dict: ...
    async def get_status(self) -> dict: ...
    async def get_metrics(self) -> dict: ...
