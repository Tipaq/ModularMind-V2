"""Sandbox cleanup scheduler — removes stale containers."""

import logging

logger = logging.getLogger(__name__)


async def cleanup_stale_sandboxes(sandbox_manager) -> None:
    """Periodic task to clean up idle sandboxes.

    Called by APScheduler in main.py lifespan.
    """
    try:
        count = await sandbox_manager.cleanup_stale()
        if count:
            logger.info("Stale sandbox cleanup: removed %d container(s)", count)
    except Exception:
        logger.warning("Sandbox cleanup error", exc_info=True)
