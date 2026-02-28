"""
Configuration Provider.

Loads agent and graph configurations from database (synced from Platform).
Model configs are loaded from YAML/JSON files on the filesystem.

Also supports Redis-backed ephemeral agents that are visible across
both FastAPI and worker processes.
"""

import asyncio
import json
import logging
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import redis.asyncio as aioredis
import yaml
from modularmind_shared.utils import compute_config_hash

from src.graph_engine import AgentConfig, ConfigVersion, GraphConfig
from src.infra.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def read_json_file(path: Path) -> dict[str, Any]:
    """Read and parse a JSON file (sync, to be used with asyncio.to_thread)."""
    with open(path) as f:
        return json.load(f)


def read_yaml_file(path: Path) -> dict[str, Any]:
    """Read and parse a YAML file (sync, to be used with asyncio.to_thread)."""
    with open(path) as f:
        data = yaml.safe_load(f)
    if data is None:
        raise ValueError(f"Empty or invalid YAML file: {path}")
    return data


class ConfigProvider:
    """Provides agent, graph, and model configurations.

    Provides config for GraphCompiler dependency injection.

    Agents and graphs are always loaded from the database (synced from Platform).
    Model configs are loaded from the filesystem (YAML/JSON).
    """

    def __init__(self, config_dir: str | None = None):
        """Initialize config provider.

        Args:
            config_dir: Directory containing model config files
        """
        self.config_dir = Path(config_dir or settings.CONFIG_DIR)
        self._agents: dict[str, AgentConfig] = {}
        self._graphs: dict[str, GraphConfig] = {}
        self._models: dict[str, dict[str, Any]] = {}
        self._versions: dict[str, ConfigVersion] = {}
        self._lock = asyncio.Lock()
        self._loaded = False
        self._redis: aioredis.Redis | None = None

    @staticmethod
    def _scan_config_files(directory: Path) -> list[Path]:
        """Scan for config files, YAML preferred over JSON.

        If both agent-1.yaml and agent-1.json exist, the YAML version wins.
        """
        if not directory.exists():
            return []
        yaml_files = {f.stem: f for f in directory.glob("*.yaml")}
        json_files = {f.stem: f for f in directory.glob("*.json")}
        merged = {**json_files, **yaml_files}  # YAML overwrites JSON
        return list(merged.values())

    async def ensure_loaded(self) -> None:
        """Ensure configurations are loaded (double-check locking)."""
        if self._loaded:
            return
        async with self._lock:
            if not self._loaded:
                await self._load_configs_locked()

    async def load_configs(self) -> None:
        """Load all configurations (public API)."""
        async with self._lock:
            await self._load_configs_locked()

    async def _load_configs_locked(self) -> None:
        """Load all configurations (must be called under self._lock).

        Uses atomic dict swap to avoid partial state visible to concurrent readers.
        """
        now = datetime.now(UTC)
        new_versions: dict[str, ConfigVersion] = {}

        new_agents, new_graphs = await self._load_agents_graphs_from_db(now, new_versions)
        new_models = await self._load_models_from_fs(now, new_versions)

        # Atomic swap: replace all dicts at once
        self._agents = new_agents
        self._graphs = new_graphs
        self._models = new_models
        self._versions = new_versions

        self._loaded = True
        logger.info(
            "Loaded %d agents, %d graphs, %d models",
            len(self._agents), len(self._graphs), len(self._models),
        )

    async def _load_agents_graphs_from_db(
        self,
        now: datetime,
        versions: dict[str, ConfigVersion],
    ) -> tuple[dict[str, AgentConfig], dict[str, GraphConfig]]:
        """Load agents and graphs from database."""
        new_agents: dict[str, AgentConfig] = {}
        new_graphs: dict[str, GraphConfig] = {}
        try:
            from src.domain_config.repository import ConfigRepository
            from src.infra.database import async_session_maker

            async with async_session_maker() as session:
                repo = ConfigRepository(session)

                for row in await repo.list_active_agents():
                    try:
                        config_dict = row.config | {"version": row.version}
                        agent = AgentConfig.model_validate(config_dict)
                        config_id = str(agent.id)
                        new_agents[config_id] = agent
                        versions[f"agent:{config_id}"] = ConfigVersion(
                            config_hash=row.config_hash, loaded_at=now,
                        )
                    except Exception as e:
                        logger.error(
                            "Failed to validate agent config %s v%d: %s",
                            row.id, row.version, e,
                        )

                for row in await repo.list_active_graphs():
                    try:
                        config_dict = row.config | {"version": row.version}
                        graph = GraphConfig.model_validate(config_dict)
                        config_id = str(graph.id)
                        new_graphs[config_id] = graph
                        versions[f"graph:{config_id}"] = ConfigVersion(
                            config_hash=row.config_hash, loaded_at=now,
                        )
                    except Exception as e:
                        logger.error(
                            "Failed to validate graph config %s v%d: %s",
                            row.id, row.version, e,
                        )
        except Exception as e:
            logger.error("Failed to load configs from DB, retaining cache: %s", e)
            new_agents = dict(self._agents)
            new_graphs = dict(self._graphs)
            for k, v in self._versions.items():
                if k.startswith("agent:") or k.startswith("graph:"):
                    versions[k] = v
        return new_agents, new_graphs

    async def _load_models_from_fs(
        self,
        now: datetime,
        versions: dict[str, ConfigVersion],
    ) -> dict[str, dict[str, Any]]:
        """Load model configs from filesystem."""
        new_models: dict[str, dict[str, Any]] = {}
        for file in self._scan_config_files(self.config_dir / "models"):
            try:
                data = await asyncio.to_thread(read_json_file if file.suffix == ".json" else read_yaml_file, file)
                model_id = data.get("model_id") or data.get("id", file.stem)
                new_models[str(model_id)] = data
                versions[f"model:{model_id}"] = ConfigVersion(
                    config_hash=compute_config_hash(data), loaded_at=now,
                )
            except Exception as e:
                logger.error("Failed to load model config %s: %s", file, e)
        return new_models

    # =========================================================================
    # Redis dependency injection
    # =========================================================================

    def set_redis(self, redis_client: aioredis.Redis) -> None:
        """Set the async Redis client for ephemeral agent support.

        Called once at app startup from the lifespan handler.
        """
        self._redis = redis_client

    # =========================================================================
    # Ephemeral agent support (Redis-backed)
    # =========================================================================

    EPHEMERAL_PREFIX = "ephemeral_agent:"
    EPHEMERAL_INDEX_KEY = "ephemeral_agent_ids"  # Redis SET of all ephemeral agent IDs
    EPHEMERAL_TTL = 86400  # 24 hours

    async def register_ephemeral_agent(self, config: AgentConfig) -> None:
        """Store ephemeral agent in Redis (visible across all processes)."""
        if not self._redis:
            raise RuntimeError("Redis not configured — call set_redis() at startup")
        agent_id = str(config.id)
        key = f"{self.EPHEMERAL_PREFIX}{agent_id}"
        data = config.model_dump(mode="json")
        pipe = self._redis.pipeline()
        pipe.set(key, json.dumps(data), ex=self.EPHEMERAL_TTL)
        pipe.sadd(self.EPHEMERAL_INDEX_KEY, agent_id)
        await pipe.execute()

    async def unregister_ephemeral_agent(self, agent_id: str) -> bool:
        """Remove ephemeral agent from Redis."""
        if not self._redis:
            return False
        pipe = self._redis.pipeline()
        pipe.delete(f"{self.EPHEMERAL_PREFIX}{agent_id}")
        pipe.srem(self.EPHEMERAL_INDEX_KEY, agent_id)
        results = await pipe.execute()
        return bool(results[0])

    async def get_ephemeral_agent(self, agent_id: str) -> AgentConfig | None:
        """Get an ephemeral agent from Redis."""
        if not self._redis:
            return None
        raw = await self._redis.get(f"{self.EPHEMERAL_PREFIX}{agent_id}")
        if raw:
            return AgentConfig.model_validate_json(raw)
        return None

    async def list_ephemeral_agents(self) -> list[AgentConfig]:
        """List all ephemeral agents using index SET (no KEYS scan)."""
        if not self._redis:
            return []
        agent_ids = await self._redis.smembers(self.EPHEMERAL_INDEX_KEY)
        if not agent_ids:
            return []
        # Pipeline GET for all IDs
        pipe = self._redis.pipeline()
        for aid in agent_ids:
            pipe.get(f"{self.EPHEMERAL_PREFIX}{aid}")
        results = await pipe.execute()
        agents = []
        expired_ids = []
        for aid, raw in zip(agent_ids, results):
            if raw:
                agents.append(AgentConfig.model_validate_json(raw))
            else:
                expired_ids.append(aid)  # TTL expired, clean up index
        # Lazy cleanup of expired entries from index SET
        if expired_ids:
            await self._redis.srem(self.EPHEMERAL_INDEX_KEY, *expired_ids)
        return agents

    async def is_ephemeral(self, agent_id: str) -> bool:
        """Check if an agent is ephemeral (exists in Redis)."""
        if not self._redis:
            return False
        return bool(await self._redis.exists(f"{self.EPHEMERAL_PREFIX}{agent_id}"))

    async def save_ephemeral_agent(self, agent_id: str) -> bool:
        """Persist ephemeral agent to DB and remove from Redis."""
        config = await self.get_ephemeral_agent(agent_id)
        if not config:
            return False

        from src.domain_config.repository import ConfigRepository
        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            repo = ConfigRepository(session)
            config_dict = config.model_dump(mode="json")
            config_dict.pop("version", None)
            await repo.create_agent_version(str(config.id), config_dict)
            await session.commit()

        self._agents[agent_id] = config
        await self.unregister_ephemeral_agent(agent_id)
        return True

    # =========================================================================
    # Agent/graph lookups (with ephemeral support)
    # =========================================================================

    async def get_agent_config(self, agent_id: str) -> AgentConfig | None:
        """Get agent configuration by ID.

        Checks Redis ephemeral agents first, then DB-loaded agents.
        """
        await self.ensure_loaded()
        if self._redis:
            ephemeral = await self.get_ephemeral_agent(agent_id)
            if ephemeral:
                return ephemeral
        return self._agents.get(agent_id)

    async def get_graph_config(self, graph_id: str) -> GraphConfig | None:
        """Get graph configuration by ID."""
        await self.ensure_loaded()
        return self._graphs.get(graph_id)

    async def list_agents(self) -> list[AgentConfig]:
        """List all available agents (DB + ephemeral).

        Ephemeral agents overwrite DB agents with the same ID.
        """
        await self.ensure_loaded()
        all_agents = dict(self._agents)  # start with DB agents
        if self._redis:
            for a in await self.list_ephemeral_agents():
                all_agents[str(a.id)] = a  # ephemeral overwrites DB
        return list(all_agents.values())

    async def list_graphs(self) -> list[GraphConfig]:
        """List all available graphs."""
        await self.ensure_loaded()
        return list(self._graphs.values())

    async def search_agents_by_capabilities(
        self, capabilities: list[str], match_all: bool = False,
        exclude_ids: list[str] | None = None,
    ) -> list[AgentConfig]:
        """Find agents matching one or more capabilities (DB + ephemeral)."""
        await self.ensure_loaded()
        exclude = set(exclude_ids or [])
        all_agents = list(self._agents.values())
        if self._redis:
            all_agents.extend(await self.list_ephemeral_agents())
        results = []
        for agent in all_agents:
            if str(agent.id) in exclude:
                continue
            agent_caps = set(agent.capabilities)
            required = set(capabilities)
            if match_all and required.issubset(agent_caps) or not match_all and required & agent_caps:
                results.append(agent)
        return results

    async def list_models(self) -> list[dict[str, Any]]:
        """List all models in the catalog."""
        await self.ensure_loaded()
        return list(self._models.values())

    async def get_model_config(self, model_id: str) -> dict[str, Any] | None:
        """Get model configuration by model_id."""
        await self.ensure_loaded()
        return self._models.get(model_id)

    def is_model_allowed(self, model_id: str) -> bool:
        """Check whether a model_id is in the loaded catalog (sync, uses cache)."""
        return model_id in self._models

    def get_config_version(self, config_type: str, config_id: str) -> str:
        """Get version hash for a specific configuration."""
        key = f"{config_type}:{config_id}"
        version = self._versions.get(key)
        return version.config_hash if version else ""

    def get_config_version_number(self, config_type: str, config_id: str) -> int | None:
        """Get integer version number for a config. Returns None if not available."""
        if config_type == "agent":
            agent = self._agents.get(config_id)
            return agent.version if agent else None
        elif config_type == "graph":
            graph = self._graphs.get(config_id)
            return graph.version if graph else None
        return None

    async def reload_async(self) -> None:
        """Eagerly reload all configurations from storage.

        Acquires the lock and reloads immediately, ensuring no concurrent
        reader sees partially-stale data.
        """
        self._loaded = False
        await self.load_configs()
        logger.info("Config reload completed")

    def reload(self) -> None:
        """Mark configs for lazy reload on next access.

        For callers that cannot await, this sets _loaded=False so the next
        ensure_loaded() call triggers a full reload. The asyncio.Lock in
        load_configs() serializes concurrent reload attempts.
        """
        self._loaded = False
        logger.info("Config reload triggered — will reload on next access")


# Singleton instance (thread-safe via double-checked locking)
_provider: ConfigProvider | None = None
_provider_lock = threading.Lock()


def get_config_provider() -> ConfigProvider:
    """Get config provider singleton."""
    global _provider
    if _provider is None:
        with _provider_lock:
            if _provider is None:
                _provider = ConfigProvider(config_dir=settings.CONFIG_DIR)
    return _provider
