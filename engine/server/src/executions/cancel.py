"""Execution cancellation utilities.

Provides a lightweight Redis-based check for revoke intents (cancel/pause)
and a dedicated exception for propagating cancellation from inside graph execution.
"""

import logging

logger = logging.getLogger(__name__)


class ExecutionCancelled(Exception):
    """Raised when an execution is cancelled via revoke_intent."""

    def __init__(self, execution_id: str = ""):
        self.execution_id = execution_id
        super().__init__(f"Execution {execution_id} was cancelled")


async def check_revoke_intent(execution_id: str) -> str | None:
    """Check if a revoke intent exists for the given execution.

    Returns the intent value ("cancel" or "pause") if set, otherwise None.
    This is a lightweight Redis GET — safe to call frequently.
    """
    from src.infra.redis import get_redis_client

    r = await get_redis_client()
    try:
        value = await r.get(f"revoke_intent:{execution_id}")
        if value is None:
            return None
        return value if isinstance(value, str) else value.decode()
    except (ConnectionError, OSError, TimeoutError) as exc:
        logger.debug("Failed to check revoke_intent for %s: %s", execution_id, exc)
        return None
    finally:
        await r.aclose()
