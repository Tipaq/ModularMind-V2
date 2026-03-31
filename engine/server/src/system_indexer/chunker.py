"""Convert StructuralUnits into embeddable Chunks for Qdrant storage."""

from __future__ import annotations

from src.rag.chunker import Chunk
from src.system_indexer.models import StructuralUnit


def split_units(units: list[StructuralUnit]) -> list[Chunk]:
    """Produce one Chunk per StructuralUnit.

    Content is formatted as: qualified_name + summary + signature.
    Metadata carries the unit_id, system_id, kind, depth, parent_id, body_hash.
    """
    chunks: list[Chunk] = []
    for idx, unit in enumerate(units):
        content = f"{unit.qualified_name}: {unit.summary}"
        if unit.signature:
            content += f"\nSignature: {unit.signature}"

        chunks.append(
            Chunk(
                content=content,
                position=idx,
                metadata={
                    "unit_id": unit.id,
                    "system_id": unit.system_id,
                    "kind": unit.kind,
                    "depth": unit.depth,
                    "parent_id": unit.parent_id,
                    "body_hash": unit.body_hash,
                },
            )
        )
    return chunks
