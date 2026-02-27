"""Task definitions — async functions consumed from Redis Streams.

These replace Celery tasks. Each function is an EventBus handler callback:
it receives event data dict and returns when done (or raises to trigger retry/DLQ).
"""

from typing import Any


# --- Execution tasks (stream: tasks:executions) ---


async def graph_execution_handler(data: dict[str, Any]) -> None:
    """Execute a graph workflow for a given conversation message."""
    # TODO: Migrate from V1 workers/tasks.py execute_graph_task
    pass


# --- Model tasks (stream: tasks:models) ---


async def model_pull_handler(data: dict[str, Any]) -> None:
    """Pull an Ollama model, reporting progress via SSE."""
    # TODO: Migrate from V1 workers/tasks.py pull_model_task
    pass
