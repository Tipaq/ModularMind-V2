"""Runtime model catalog service.

Manages the local model catalog synced from the platform,
tracks Ollama pull state, and provides model availability checks.
"""

import json
import logging
from pathlib import Path
from typing import Any

import httpx
import redis.asyncio as aioredis

from src.infra.config import get_settings
from src.infra.redis import get_redis_pool

logger = logging.getLogger(__name__)
settings = get_settings()


class RuntimeModelService:
    """Manages the runtime's local view of the model catalog."""

    def __init__(self, config_dir: str | None = None):
        self._config_dir = Path(config_dir or settings.CONFIG_DIR)
        self._models_dir = self._config_dir / "models"
        self._models_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Seed catalog loading
    # ------------------------------------------------------------------

    def load_seed_catalog(self) -> int:
        """Seed the runtime catalog from curated model lists.

        Creates one JSON file per curated model entry. Skips models that
        already have an individual file to avoid overwriting runtime changes.

        Returns the number of models seeded.
        """
        from src.models.curated import CURATED_CLOUD_MODELS, CURATED_OLLAMA_MODELS

        seeded = 0

        # Seed Ollama models
        for entry in CURATED_OLLAMA_MODELS:
            model_name = entry.get("model_name", "")
            model_id = model_name.replace(":", "-")
            if not model_id:
                continue

            target = self._models_dir / f"{model_id}.json"
            if target.exists():
                continue

            is_embedding = bool(entry.get("capabilities", {}).get("embedding"))
            model_data = {
                "id": model_id,
                "name": entry.get("display_name", model_name),
                "provider": "ollama",
                "model_id": model_name,
                "display_name": entry.get("display_name"),
                "model_type": "local",
                "context_window": entry.get("context_window"),
                "max_output_tokens": entry.get("max_output_tokens"),
                "parameter_size": entry.get("size"),
                "disk_size": entry.get("disk_size"),
                "is_required": False,
                "is_active": True,
                "is_embedding": is_embedding,
                "model_metadata": {},
            }

            target.write_text(json.dumps(model_data, indent=2))
            logger.info("Seeded model: %s (%s)", model_id, model_name)
            seeded += 1

        # Seed cloud provider models
        for provider, models in CURATED_CLOUD_MODELS.items():
            for entry in models:
                model_name = entry.get("model_name", "")
                model_id = f"{provider}-{model_name}".replace(":", "-").replace(".", "-")
                if not model_id:
                    continue

                target = self._models_dir / f"{model_id}.json"
                if target.exists():
                    continue

                model_data = {
                    "id": model_id,
                    "name": entry.get("display_name", model_name),
                    "provider": provider,
                    "model_id": model_name,
                    "display_name": entry.get("display_name"),
                    "model_type": "remote",
                    "context_window": entry.get("context_window"),
                    "max_output_tokens": entry.get("max_output_tokens"),
                    "is_required": False,
                    "is_active": True,
                    "is_embedding": False,
                    "model_metadata": {},
                }

                target.write_text(json.dumps(model_data, indent=2))
                logger.info("Seeded model: %s (%s)", model_id, model_name)
                seeded += 1

        if seeded:
            logger.info("Seeded %d models from curated catalog", seeded)
        return seeded

    # ------------------------------------------------------------------
    # Catalog persistence (JSON files, same pattern as agents/graphs)
    # ------------------------------------------------------------------

    def list_models(self) -> list[dict[str, Any]]:
        """List all models in the local catalog."""
        models = []
        for f in self._models_dir.glob("*.json"):
            try:
                models.append(json.loads(f.read_text()))
            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"Failed to read model file {f}: {e}")
        return models

    def get_model(self, model_id: str) -> dict[str, Any] | None:
        """Get a single model by ID."""
        path = self._models_dir / f"{model_id}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None

    def save_model(self, model_id: str, data: dict[str, Any]) -> None:
        """Save / update a model in the local catalog."""
        path = self._models_dir / f"{model_id}.json"
        path.write_text(json.dumps(data, indent=2, default=str))

    def delete_model(self, model_id: str) -> None:
        """Remove a model from the local catalog."""
        path = self._models_dir / f"{model_id}.json"
        if path.exists():
            path.unlink()

    async def uninstall_model(self, model_id: str) -> None:
        """Remove a model from catalog, Ollama (if local), and Redis progress."""
        model_data = self.get_model(model_id)
        if not model_data:
            return

        model_name = model_data.get("model_id", "")
        provider = model_data.get("provider", "")

        # Delete from Ollama if it's a local model
        if provider == "ollama" and model_name:
            try:
                async with httpx.AsyncClient(
                    base_url=settings.OLLAMA_BASE_URL, timeout=30.0,
                ) as client:
                    resp = await client.request(
                        "DELETE", "/api/delete", json={"model": model_name},
                    )
                    if resp.status_code == 200:
                        logger.info("Deleted model from Ollama: %s", model_name)
                    else:
                        logger.warning(
                            "Ollama delete returned %d for %s", resp.status_code, model_name,
                        )
            except httpx.HTTPError as e:
                logger.warning("Failed to delete model from Ollama: %s", e)

            # Clean up Redis progress keys
            pool = get_redis_pool()
            r = aioredis.Redis(connection_pool=pool)
            try:
                await r.delete(
                    f"runtime:model_pull_progress:{model_name}",
                    f"runtime:model_pull_task:{model_name}",
                    f"runtime:model_pull_cancel:{model_name}",
                )
            finally:
                await r.aclose()

        # Remove catalog file
        self.delete_model(model_id)

    # ------------------------------------------------------------------
    # Ollama availability
    # ------------------------------------------------------------------

    async def get_installed_ollama_models(self) -> set[str]:
        """Query Ollama /api/tags for locally installed model names."""
        details = await self.get_ollama_model_details()
        return set(details.keys())

    async def get_ollama_model_details(self) -> dict[str, dict[str, Any]]:
        """Query Ollama /api/tags and return rich details keyed by model name.

        Returns a dict like::

            {"qwen3:8b": {"size_bytes": 5225388164, "parameter_size": "8.2B",
                          "quantization": "Q4_K_M", "family": "qwen3"}, ...}
        """
        try:
            async with httpx.AsyncClient(
                base_url=settings.OLLAMA_BASE_URL, timeout=10.0
            ) as client:
                resp = await client.get("/api/tags")
                resp.raise_for_status()
                data = resp.json()
                result: dict[str, dict[str, Any]] = {}
                for m in data.get("models", []):
                    details = m.get("details") or {}
                    info = {
                        "size_bytes": m.get("size"),
                        "parameter_size": details.get("parameter_size"),
                        "quantization": details.get("quantization_level"),
                        "family": details.get("family"),
                    }
                    name = m["name"]
                    result[name] = info
                    # Also index without :latest so "nomic-embed-text"
                    # matches "nomic-embed-text:latest"
                    if name.endswith(":latest"):
                        result[name.removesuffix(":latest")] = info
                return result
        except httpx.HTTPError as e:
            logger.warning(f"Failed to query Ollama tags: {e}")
            return {}

    async def check_model_available(self, model_data: dict[str, Any]) -> bool:
        """Check whether a model is available for use.

        - For Ollama models: must be pulled locally.
        - For cloud models: always available (key check is separate).
        """
        if model_data.get("provider") == "ollama":
            installed = await self.get_installed_ollama_models()
            model_name = model_data.get("model_id", "")
            return model_name in installed
        return True

    # ------------------------------------------------------------------
    # Pull status (via Redis, written by the worker task)
    # ------------------------------------------------------------------

    async def get_pull_progress(self, model_name: str) -> dict[str, str]:
        """Get pull progress from Redis hash."""
        pool = get_redis_pool()
        client = aioredis.Redis(connection_pool=pool)
        try:
            key = f"runtime:model_pull_progress:{model_name}"
            data = await client.hgetall(key)
            return data or {}
        finally:
            await client.aclose()

    # ------------------------------------------------------------------
    # Trigger pull via Redis Streams
    # ------------------------------------------------------------------

    async def trigger_pull(self, model_name: str) -> str:
        """Dispatch a model pull task via Redis Streams.

        Returns the Redis Stream message ID.
        """
        from src.infra.publish import enqueue_model_pull

        msg_id = await enqueue_model_pull(model_name)

        # Set initial progress so the frontend sees "downloading" immediately
        from src.infra.redis import get_redis_client
        r = await get_redis_client()
        try:
            await r.hset(
                f"runtime:model_pull_progress:{model_name}",
                mapping={"status": "downloading", "progress": "0"},
            )
            await r.set(f"runtime:model_pull_task:{model_name}", msg_id, ex=7200)
        finally:
            await r.aclose()

        logger.info("Dispatched pull task for %s: %s", model_name, msg_id)
        return msg_id

    async def cancel_pull(self, model_name: str) -> bool:
        """Cancel an in-progress model pull via Redis flag.

        The pull task checks this flag during streaming and stops gracefully.
        """
        pool = get_redis_pool()
        client = aioredis.Redis(connection_pool=pool)
        try:
            progress_key = f"runtime:model_pull_progress:{model_name}"
            progress = await client.hgetall(progress_key)
            status = (progress.get(b"status") or b"").decode()
            if status != "downloading":
                return False
            # Set cancel flag — the pull task checks this in its stream loop
            await client.set(f"runtime:model_pull_cancel:{model_name}", "1", ex=3600)
            await client.hset(progress_key, mapping={"status": "cancelled", "progress": "0"})
            # Clean up task reference
            await client.delete(f"runtime:model_pull_task:{model_name}")
            return True
        finally:
            await client.aclose()

    # ------------------------------------------------------------------
    # Required-model auto-pull
    # ------------------------------------------------------------------

    async def ensure_required_models(self) -> list[str]:
        """Pull any required Ollama models that are not yet installed.

        Returns list of model names that were dispatched for pulling.
        """
        installed = await self.get_installed_ollama_models()
        dispatched: list[str] = []

        for model_data in self.list_models():
            if not model_data.get("is_required"):
                continue
            if model_data.get("provider") != "ollama":
                continue

            model_name = model_data.get("model_id", "")
            if model_name and model_name not in installed:
                await self.trigger_pull(model_name)
                dispatched.append(model_name)
                logger.info("Auto-pulling required model: %s", model_name)

        return dispatched

    # ------------------------------------------------------------------
    # Catalog-aware model ID check
    # ------------------------------------------------------------------

    def is_model_in_catalog(self, model_id: str) -> bool:
        """Check whether a model_id is present in the local catalog."""
        for model_data in self.list_models():
            if model_data.get("model_id") == model_id:
                return True
        return False


# Singleton
_service: RuntimeModelService | None = None


def get_model_service() -> RuntimeModelService:
    """Get model service singleton."""
    global _service
    if _service is None:
        _service = RuntimeModelService()
    return _service
