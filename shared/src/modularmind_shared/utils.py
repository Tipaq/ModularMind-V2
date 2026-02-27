"""
Shared utilities between Engine and Platform.

Contains canonical implementations that MUST be identical across
services to avoid hash mismatches and sync loops.
"""

import hashlib
import json
from typing import Any


def compute_config_hash(config: dict[str, Any]) -> str:
    """Compute deterministic hash of a configuration dict.

    Uses compact JSON serialization (sorted keys, no spaces) to ensure
    the same hash regardless of whether the config was loaded from
    JSON or YAML.

    Args:
        config: Configuration dictionary

    Returns:
        64-character SHA256 hex digest
    """
    normalized = json.dumps(config, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
