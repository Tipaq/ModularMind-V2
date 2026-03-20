"""Platform sync service — pull-based config synchronization.

The engine polls the platform at regular intervals for manifest changes.
When a new version is detected, it fetches and applies the updated configs.

Data is transformed from Platform format to Engine format before storage.
"""

import logging
from typing import Any

import httpx
import sqlalchemy.exc

from src.infra.config import settings

logger = logging.getLogger(__name__)


def _transform_agent(raw: dict[str, Any]) -> dict[str, Any]:
    """Transform a Platform agent manifest entry into Engine AgentConfig format.

    Platform sends:  id, name, description, model, provider, config.system_prompt, tags, version
    Engine expects:  id, name, description, model_id, system_prompt, capabilities, version
    """
    config_block = raw.get("config") or {}
    result: dict[str, Any] = {
        "id": raw["id"],
        "name": raw.get("name", ""),
        "description": raw.get("description", ""),
        "model_id": f"{raw.get('provider', 'ollama')}:{raw.get('model', 'llama3.2')}",
        "system_prompt": config_block.get("system_prompt", ""),
        "capabilities": raw.get("tags", []),
        "version": raw.get("version", 1),
        "timeout_seconds": config_block.get("timeout_seconds", 120),
        "memory_enabled": config_block.get("memory_enabled", True),
        "gateway_permissions": config_block.get("gateway_permissions"),
    }
    # Pass through tool_categories and rag_config if set on Platform
    if config_block.get("tool_categories"):
        result["tool_categories"] = config_block["tool_categories"]
    if config_block.get("rag_config"):
        result["rag_config"] = config_block["rag_config"]
    return result


def _transform_graph_node(raw: dict[str, Any]) -> dict[str, Any]:
    """Transform a Platform graph node into Engine NodeConfig format.

    Platform may send data in two layouts:
      1. Flat:   id, type, label, config, agentId  (legacy / some Studio paths)
      2. Nested: id, type, data: {label, config, agent_id, ...}  (ReactFlow format)
    Engine expects: id, type, data (dict with label, config, agent_id, etc.)
    """
    # Start from nested data if present, else build from flat keys
    nested = raw.get("data") or {}
    data: dict[str, Any] = dict(nested)

    # Flat top-level overrides (legacy compat)
    if "label" in raw:
        data["label"] = raw["label"]
    if "config" in raw:
        data["config"] = raw["config"]
    if "agentId" in raw:
        data["agent_id"] = raw["agentId"]

    return {
        "id": raw["id"],
        "type": raw.get("type", "agent"),
        "data": data,
    }


def _transform_graph(raw: dict[str, Any]) -> dict[str, Any]:
    """Transform a Platform graph manifest entry into Engine GraphConfig format.

    Platform sends:  id, name, description, nodes, edges, version
    Engine expects:  id, name, description, nodes (NodeConfig), edges (EdgeConfig), version
    """
    nodes = [_transform_graph_node(n) for n in raw.get("nodes", [])]
    edges = [
        {"source": e["source"], "target": e["target"], "data": e.get("data", {})}
        for e in raw.get("edges", [])
    ]
    entry_node_id = nodes[0]["id"] if nodes else None
    return {
        "id": raw["id"],
        "name": raw.get("name", ""),
        "description": raw.get("description", ""),
        "version": raw.get("version", 1),
        "entry_node_id": entry_node_id,
        "nodes": nodes,
        "edges": edges,
    }


def _transform_automation(raw: dict[str, Any]) -> dict[str, Any]:
    """Transform a Platform automation manifest entry into Engine AutomationConfig format.

    Platform sends:  id, name, description, enabled, config, version, tags
    Engine expects:  id, name, description, enabled, trigger, triage, execution,
                     post_actions, settings, version, tags
    """
    config_block = raw.get("config") or {}
    return {
        "id": raw["id"],
        "name": raw.get("name", ""),
        "description": raw.get("description", ""),
        "enabled": raw.get("enabled", False),
        "trigger": config_block.get("trigger", {}),
        "triage": config_block.get("triage"),
        "execution": config_block.get("execution", {}),
        "post_actions": config_block.get("post_actions", []),
        "settings": config_block.get("settings", {}),
        "version": raw.get("version", 1),
        "tags": raw.get("tags", []),
    }


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

            logger.info("New config version detected: %d → %d", self._local_version, remote_version)

            # Transform Platform format → Engine format, then write to DB
            await self._apply_agents(manifest.get("agents", []))
            await self._apply_graphs(manifest.get("graphs", []))
            await self._apply_automations(manifest.get("automations", []))

            self._local_version = remote_version

            # Reload ConfigProvider in-memory cache so API serves updated configs
            from src.domain_config.provider import get_config_provider

            await get_config_provider().reload_async()

            logger.info("Config sync complete — now at version %d", remote_version)
            return True

        except httpx.HTTPError:
            logger.exception("Failed to poll platform for config updates")
            return False

    async def _apply_agents(self, agents: list[dict]) -> None:
        """Transform and write agent configs to DB via ConfigRepository."""
        from src.domain_config.repository import ConfigRepository
        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            repo = ConfigRepository(session)
            for raw_agent in agents:
                agent_id = raw_agent.get("id", "")
                if not agent_id:
                    continue
                try:
                    engine_config = _transform_agent(raw_agent)
                    await repo.create_agent_version(
                        agent_id=agent_id,
                        config=engine_config,
                        created_by="platform-sync",
                        change_note=f"Synced from platform (v{raw_agent.get('version', 1)})",
                    )
                    logger.info("Applied agent config: %s (%s)", agent_id, raw_agent.get("name"))
                except (ValueError, KeyError, sqlalchemy.exc.SQLAlchemyError):
                    logger.exception("Failed to apply agent %s", agent_id)
            await session.commit()

    async def _apply_graphs(self, graphs: list[dict]) -> None:
        """Transform and write graph configs to DB via ConfigRepository."""
        from src.domain_config.repository import ConfigRepository
        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            repo = ConfigRepository(session)
            for raw_graph in graphs:
                graph_id = raw_graph.get("id", "")
                if not graph_id:
                    continue
                try:
                    engine_config = _transform_graph(raw_graph)
                    await repo.create_graph_version(
                        graph_id=graph_id,
                        config=engine_config,
                        created_by="platform-sync",
                        change_note=f"Synced from platform (v{raw_graph.get('version', 1)})",
                    )
                    logger.info("Applied graph config: %s (%s)", graph_id, raw_graph.get("name"))
                except (ValueError, KeyError, sqlalchemy.exc.SQLAlchemyError):
                    logger.exception("Failed to apply graph %s", graph_id)
            await session.commit()

    async def _apply_automations(self, automations: list[dict]) -> None:
        """Transform and store automation configs in Redis for the AutomationRunner."""
        if not automations:
            return

        import json

        import redis.asyncio as aioredis

        from src.graph_engine.interfaces import AutomationConfig
        from src.infra.config import get_settings

        s = get_settings()
        r = aioredis.from_url(s.REDIS_URL, decode_responses=True)
        try:
            pipe = r.pipeline()
            automation_ids = []
            for raw_automation in automations:
                aid = raw_automation.get("id", "")
                if not aid:
                    continue
                try:
                    engine_config = _transform_automation(raw_automation)
                    # Validate via pydantic
                    AutomationConfig.model_validate(engine_config)
                    pipe.set(
                        f"automation:config:{aid}",
                        json.dumps(engine_config),
                    )
                    automation_ids.append(aid)
                    logger.info(
                        "Applied automation config: %s (%s)", aid, raw_automation.get("name")
                    )
                except (ValueError, KeyError):
                    logger.exception("Failed to apply automation %s", aid)
            # Store index of all automation IDs
            if automation_ids:
                pipe.delete("automation:ids")
                pipe.sadd("automation:ids", *automation_ids)
            await pipe.execute()
        finally:
            await r.aclose()

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
