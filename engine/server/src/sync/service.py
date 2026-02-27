"""Platform sync service — pull-based config synchronization.

The engine polls the platform at regular intervals for manifest changes.
When a new version is detected, it fetches and applies the updated configs.
"""

import json
import logging
from pathlib import Path

import httpx

from src.infra.config import settings

logger = logging.getLogger(__name__)


class SyncService:
    """Handles config synchronization with the platform."""

    def __init__(self) -> None:
        self._local_version: int = 0
        self._client: httpx.AsyncClient | None = None
        self._config_dir = Path(settings.CONFIG_DIR) if hasattr(settings, 'CONFIG_DIR') else Path("/data/config")

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

            # Fetch full config payload
            config_resp = await self._client.get("/api/sync/configs")
            config_resp.raise_for_status()
            payload = config_resp.json()

            await self._apply_agents(payload.get("agents", []))
            await self._apply_graphs(payload.get("graphs", []))

            self._local_version = remote_version
            logger.info("Config sync complete — now at version %d", remote_version)
            return True

        except httpx.HTTPError:
            logger.exception("Failed to poll platform for config updates")
            return False

    async def _apply_agents(self, agents: list[dict]) -> None:
        """Write agent configs to local YAML/JSON files."""
        agents_dir = self._config_dir / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)
        for agent in agents:
            agent_id = agent.get("id", "")
            if not agent_id:
                continue
            path = agents_dir / f"{agent_id}.json"
            path.write_text(json.dumps(agent, indent=2))
            logger.info("Applied agent config: %s", agent_id)

    async def _apply_graphs(self, graphs: list[dict]) -> None:
        """Write graph configs to local YAML/JSON files."""
        graphs_dir = self._config_dir / "graphs"
        graphs_dir.mkdir(parents=True, exist_ok=True)
        for graph in graphs:
            graph_id = graph.get("id", "")
            if not graph_id:
                continue
            path = graphs_dir / f"{graph_id}.json"
            path.write_text(json.dumps(graph, indent=2))
            logger.info("Applied graph config: %s", graph_id)

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
