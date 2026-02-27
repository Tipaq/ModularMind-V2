"""EventBus ABC — publish/subscribe interface for async task processing.

Abstraction allows swapping Redis Streams → Redpanda/Kafka later.
Used by the worker process for both task queues and memory pipeline.
"""

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any


class EventBus(ABC):
    @abstractmethod
    async def publish(self, stream: str, data: dict[str, Any]) -> str:
        """Publish an event to a stream. Returns the event ID."""
        ...

    @abstractmethod
    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
        max_retries: int = 3,
    ) -> None:
        """Subscribe to a stream with a handler callback.

        The implementation handles retry logic and DLQ internally.
        Runs until stop() is called.
        """
        ...

    @abstractmethod
    async def ensure_group(self, stream: str, group: str) -> None:
        """Create consumer group if it doesn't exist."""
        ...

    @abstractmethod
    async def stream_info(self, stream: str) -> dict[str, Any]:
        """Return stream metadata (length, consumer groups, pending counts)."""
        ...

    @abstractmethod
    def stop(self) -> None:
        """Signal the bus to stop consuming."""
        ...
