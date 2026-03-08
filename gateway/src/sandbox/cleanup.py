"""Sandbox cleanup scheduler — removes stale containers and old workspaces."""

import logging
import os
import shutil
import time

from src.config import get_settings

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


async def cleanup_stale_workspaces() -> None:
    """Daily task to remove workspace directories older than retention period.

    Scans WORKSPACE_ROOT for agent workspace dirs, removes those not modified
    within WORKSPACE_RETENTION_DAYS.
    """
    settings = get_settings()
    root = settings.WORKSPACE_ROOT
    retention_seconds = settings.WORKSPACE_RETENTION_DAYS * 86400
    now = time.time()
    removed = 0

    if not os.path.isdir(root):
        return

    try:
        for entry in os.scandir(root):
            if not entry.is_dir() or entry.name == "shared":
                continue

            # Check last modification time
            try:
                mtime = entry.stat().st_mtime
            except OSError:
                continue

            if now - mtime > retention_seconds:
                try:
                    shutil.rmtree(entry.path)
                    removed += 1
                except OSError:
                    logger.warning("Failed to remove workspace %s", entry.path)

        if removed:
            logger.info("Workspace cleanup: removed %d stale workspace(s)", removed)
    except Exception:
        logger.warning("Workspace cleanup error", exc_info=True)
