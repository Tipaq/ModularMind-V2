"""Produce a skimmable tree summary of an indexed system."""

from __future__ import annotations

import logging

from qdrant_client import models

from src.infra.qdrant import SYSTEM_INDEXES_COLLECTION, qdrant_factory

logger = logging.getLogger(__name__)


async def skim_system(
    system_id: str,
    max_tokens: int = 2000,
) -> str:
    """Return an indented tree of top-level entities for a system.

    Scrolls depth=0 units from Qdrant, formats as a compact outline.
    Truncates if the result exceeds max_tokens (approximated as chars/4).
    """
    client = await qdrant_factory.get_client()
    max_chars = max_tokens * 4
    lines: list[str] = []
    offset = None

    while True:
        result = await client.scroll(
            collection_name=SYSTEM_INDEXES_COLLECTION,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.system_id",
                        match=models.MatchValue(value=system_id),
                    ),
                    models.FieldCondition(
                        key="metadata.depth",
                        match=models.MatchValue(value=0),
                    ),
                ]
            ),
            limit=200,
            offset=offset,
            with_payload=["content", "metadata.kind"],
        )
        points, next_offset = result
        for point in points:
            content = point.payload.get("content", "")
            kind = point.payload.get("metadata", {}).get("kind", "")
            tag = f"[{kind}]" if kind else ""
            lines.append(f"  {tag} {content.split(chr(10))[0]}")

        if next_offset is None or _total_chars(lines) >= max_chars:
            break
        offset = next_offset

    if not lines:
        return "No structural data indexed for this system."

    header = f"System structure ({len(lines)} top-level entities):\n"
    body = "\n".join(lines)
    full = header + body

    if len(full) > max_chars:
        truncated = full[:max_chars].rsplit("\n", 1)[0]
        return truncated + f"\n  ... (truncated, {len(lines)} total entities)"

    return full


def _total_chars(lines: list[str]) -> int:
    return sum(len(line) for line in lines) + len(lines)
