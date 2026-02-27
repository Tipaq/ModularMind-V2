"""Platform sync service — pull-based config synchronization.

The engine polls the platform at regular intervals for manifest changes.
When a new version is detected, it fetches and applies the updated configs.

Flow:
1. GET {PLATFORM_URL}/api/sync/manifest (X-Engine-Key header)
2. Compare manifest version with local version
3. If newer: fetch changed agent/graph configs
4. Apply changes to local YAML files + reload ConfigProvider
"""

import logging

import httpx

from src.infra.config import settings

logger = logging.getLogger(__name__)


class SyncService:
    """Handles config synchronization with the platform."""

    def __init__(self) -> None:
        self._local_version: int = 0
        self._client: httpx.AsyncClient | None = None

    async def initialize(self) -> None:
        if not settings.PLATFORM_URL or not settings.ENGINE_API_KEY:
            logger.info("Platform sync disabled — no PLATFORM_URL or ENGINE_API_KEY configured")
            return
        self._client = httpx.AsyncClient(
            base_url=settings.PLATFORM_URL,
            headers={"X-Engine-Key": settings.ENGINE_API_KEY},
            timeout=30.0,
        )

    async def poll(self) -> bool:
        """Check platform for updates. Returns True if configs were updated."""
        if not self._client:
            return False

        try:
            resp = await self._client.get("/api/sync/manifest")
            resp.raise_for_status()
            manifest = resp.json()

            remote_version = manifest.get("version", 0)
            if remote_version <= self._local_version:
                return False

            logger.info(
                "New config version detected: %d → %d", self._local_version, remote_version
            )
            # TODO: Fetch individual changed configs and apply
            self._local_version = remote_version
            return True

        except httpx.HTTPError:
            logger.exception("Failed to poll platform for config updates")
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
