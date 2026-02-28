"""
Layer file loader — reads .md layer files from disk with caching.

Layer files live in ``prompt_layers/layers/`` and are loaded once at
startup then cached in memory.  Restart the process to pick up edits.
"""

import logging
from functools import cache
from pathlib import Path

logger = logging.getLogger(__name__)

_LAYERS_DIR = Path(__file__).parent / "layers"


@cache
def load_layer(filename: str) -> str:
    """Load a layer file by name (relative to ``layers/`` dir).

    Returns empty string if the file does not exist.
    """
    path = _LAYERS_DIR / filename
    if not path.exists():
        logger.warning("Layer file not found: %s", path)
        return ""
    return path.read_text(encoding="utf-8").strip()


def get_supervisor_identity() -> str:
    """Return the supervisor identity layer."""
    return load_layer("supervisor_identity.md")


def get_supervisor_personality() -> str:
    """Return the default supervisor personality layer."""
    return load_layer("supervisor_personality.md")


def get_tool_task() -> str:
    """Return the TOOL_RESPONSE task instructions layer."""
    return load_layer("tool_task.md")
