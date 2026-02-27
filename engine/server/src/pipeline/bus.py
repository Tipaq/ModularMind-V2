"""EventBus ABC — publish/subscribe interface for the memory pipeline.

Abstraction allows swapping Redis Streams → Redpanda later.
"""

from abc import ABC, abstractmethod
from typing import Any


class EventBus(ABC):
    @abstractmethod
    async def publish(self, stream: str, event: dict[str, Any]) -> str:
        """Publish an event to a stream. Returns the event ID."""
        ...

    @abstractmethod
    async def subscribe(self, stream: str, group: str, consumer: str):
        """Subscribe to a stream as part of a consumer group."""
        ...

    @abstractmethod
    async def ack(self, stream: str, group: str, event_id: str) -> None:
        """Acknowledge a processed event."""
        ...
