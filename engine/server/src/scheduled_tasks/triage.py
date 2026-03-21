"""PR triage — classify items as simple or complex.

Simple items go to a single agent, complex items go to a multi-agent graph.
Uses heuristics first, with optional LLM fallback for ambiguous cases.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def classify_item(
    item: dict[str, Any],
    threshold: dict[str, Any] | None = None,
) -> str:
    """Classify a source item as 'simple' or 'complex'.

    Args:
        item: Source item with file_count, files, diff etc.
        threshold: Config with max_files and max_lines.

    Returns:
        "simple" or "complex"
    """
    threshold = threshold or {}
    max_files = threshold.get("max_files", 10)
    max_lines = threshold.get("max_lines", 500)

    file_count = item.get("file_count", 0)
    files = item.get("files", [])

    total_lines = sum(f.get("additions", 0) + f.get("deletions", 0) for f in files)

    if file_count > max_files:
        return "complex"

    if total_lines > max_lines:
        return "complex"

    config_extensions = {".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".cfg"}
    if all(any(f.get("filename", "").endswith(ext) for ext in config_extensions) for f in files):
        return "simple"

    doc_extensions = {".md", ".txt", ".rst", ".adoc"}
    if all(any(f.get("filename", "").endswith(ext) for ext in doc_extensions) for f in files):
        return "simple"

    return "simple"
