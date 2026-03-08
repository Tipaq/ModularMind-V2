"""
Local export fine-tuning provider.

Exports JSONL datasets to a local directory for manual fine-tuning
with external tools (Unsloth, LoRA, etc.) served via Ollama/vLLM.
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from src.infra.config import get_settings

from .base import FineTuningProvider

logger = logging.getLogger(__name__)

_README_CONTENT = """# Fine-Tuning Export

This directory contains a JSONL dataset exported from ModularMind for fine-tuning.

## Files
- `dataset.jsonl` — Training data in OpenAI chat format
- `job_config.json` — Model info, hyperparameters, and metadata

## Usage with Unsloth / LoRA

1. Install unsloth: `pip install unsloth`
2. Load the dataset:
   ```python
   from datasets import load_dataset
   dataset = load_dataset("json", data_files="dataset.jsonl", split="train")
   ```
3. Fine-tune with your preferred framework
4. Export the adapter weights

## Registering in Ollama

1. Create a Modelfile pointing to your fine-tuned weights
2. Run: `ollama create my-finetuned-model -f Modelfile`
3. Register in ModularMind dashboard → Models

## Registering in vLLM

1. Host the model: `vllm serve my-finetuned-model --port 8100`
2. Configure in ModularMind: Settings → LLM Providers → Add vLLM endpoint
"""


class LocalExportProvider(FineTuningProvider):
    """Export JSONL for local/external fine-tuning."""

    @property
    def provider_name(self) -> str:
        return "local_export"

    async def upload_dataset(self, file_path: str) -> str:
        """Copy dataset to the export directory."""
        settings = get_settings()
        export_dir = Path(settings.FINETUNING_STORAGE_DIR) / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        export_name = f"{timestamp}_{uuid4().hex[:8]}"
        dest_dir = export_dir / export_name
        dest_dir.mkdir(parents=True, exist_ok=True)

        dest_file = dest_dir / "dataset.jsonl"
        shutil.copy2(file_path, dest_file)

        # Write README
        readme_path = dest_dir / "README.md"
        readme_path.write_text(_README_CONTENT, encoding="utf-8")

        logger.info("Exported dataset to: %s", dest_dir)
        return str(dest_file)

    async def create_job(self, file_id: str, base_model: str, hyperparameters: dict) -> str:
        """Write job config alongside the exported JSONL. Completes immediately."""
        dest_file = Path(file_id)
        dest_dir = dest_file.parent
        job_id = str(uuid4())

        config = {
            "job_id": job_id,
            "base_model": base_model,
            "hyperparameters": hyperparameters,
            "dataset_file": str(dest_file),
            "created_at": datetime.now(UTC).isoformat(),
            "instructions": (
                "Use this config with your preferred fine-tuning framework. "
                "The dataset is in OpenAI chat JSONL format."
            ),
        }

        config_path = dest_dir / "job_config.json"
        config_path.write_text(json.dumps(config, indent=2, default=str), encoding="utf-8")

        logger.info("Created local export job: %s at %s", job_id, dest_dir)
        return job_id

    async def get_job_status(self, job_id: str) -> dict:
        """Local exports are always completed immediately."""
        return {
            "status": "completed",
            "fine_tuned_model": None,
            "trained_tokens": 0,
            "result_files": [],
            "error": None,
        }

    async def cancel_job(self, job_id: str) -> bool:
        """No-op for local exports."""
        return True

    async def list_jobs(self) -> list[dict]:
        """List export directories."""
        settings = get_settings()
        export_dir = Path(settings.FINETUNING_STORAGE_DIR) / "exports"
        if not export_dir.exists():
            return []

        jobs = []
        for config_file in sorted(export_dir.glob("*/job_config.json"), reverse=True):
            try:
                config = json.loads(config_file.read_text(encoding="utf-8"))
                jobs.append(
                    {
                        "id": config.get("job_id", "unknown"),
                        "status": "completed",
                        "model": config.get("base_model", "unknown"),
                        "fine_tuned_model": None,
                        "created_at": config.get("created_at"),
                    }
                )
            except (json.JSONDecodeError, OSError):
                continue

        return jobs[:20]
