"""EventBus ABC — publish/subscribe interface for async task processing.

Abstraction allows swapping Redis Streams → Redpanda/Kafka later.
Used by the worker process for both task queues and memory pipeline.
"""

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class EventBus(ABC):
    @abstractmethod
    async def publish(self, stream: str, event: dict[str, Any]) -> str:
        """Publish an event to a stream. Returns the event ID."""
        ...

    @abstractmethod
    async def subscribe(
        self, stream: str, group: str, consumer: str
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """Subscribe to a stream as part of a consumer group.

        Yields (event_id, event_data) tuples.
        """
        ...

    @abstractmethod
    async def ack(self, stream: str, group: str, event_id: str) -> None:
        """Acknowledge a processed event."""
        ...

    @abstractmethod
    async def ensure_group(self, stream: str, group: str) -> None:
        """Create consumer group if it doesn't exist."""
        ...
