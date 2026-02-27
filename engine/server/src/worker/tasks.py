"""Task definitions — async functions consumed from Redis Streams.

These replace Celery tasks. Each function processes an event from a specific
Redis Stream and returns when done (or raises to trigger retry/DLQ).
"""

from typing import Any

# TODO: Implement task handlers:

# --- Execution tasks (stream: tasks:executions) ---


async def execute_graph(event: dict[str, Any]) -> None:
    """Execute a graph workflow for a given conversation message."""
    # TODO: Migrate from V1 workers/tasks.py execute_graph_task


async def execute_agent(event: dict[str, Any]) -> None:
    """Execute a single agent invocation."""
    # TODO: Migrate from V1 workers/tasks.py


# --- Model tasks (stream: tasks:models) ---


async def pull_model(event: dict[str, Any]) -> None:
    """Pull an Ollama model, reporting progress via SSE."""
    # TODO: Migrate from V1 workers/tasks.py pull_model_task
