"""Tests for the structural chunker."""

from src.system_indexer.chunker import split_units
from src.system_indexer.models import StructuralUnit


class TestSplitUnits:
    def test_produces_one_chunk_per_unit(self, sample_units):
        chunks = split_units(sample_units)
        assert len(chunks) == len(sample_units)

    def test_content_format(self):
        unit = StructuralUnit(
            id="u1",
            system_id="s1",
            kind="table",
            name="users",
            qualified_name="db.users",
            summary="User accounts table",
            signature="CREATE TABLE users (id INT, email TEXT)",
        )
        chunks = split_units([unit])
        content = chunks[0].content
        assert "db.users" in content
        assert "User accounts table" in content
        assert "Signature:" in content
        assert "CREATE TABLE users" in content

    def test_metadata_includes_unit_id_and_kind(self, sample_units):
        chunks = split_units(sample_units)
        for chunk, unit in zip(chunks, sample_units, strict=True):
            assert chunk.metadata["unit_id"] == unit.id
            assert chunk.metadata["kind"] == unit.kind
            assert chunk.metadata["system_id"] == unit.system_id

    def test_empty_list_returns_empty(self):
        assert split_units([]) == []

    def test_preserves_depth_and_parent_id(self, sample_units):
        chunks = split_units(sample_units)
        child_chunk = chunks[1]
        assert child_chunk.metadata["depth"] == 1
        assert child_chunk.metadata["parent_id"] == sample_units[0].id

    def test_no_signature_omits_line(self):
        unit = StructuralUnit(
            id="u1",
            system_id="s1",
            kind="table",
            name="users",
            qualified_name="db.users",
            summary="User accounts",
            signature="",
        )
        chunks = split_units([unit])
        assert "Signature:" not in chunks[0].content

    def test_body_hash_in_metadata(self):
        unit = StructuralUnit(
            id="u1",
            system_id="s1",
            kind="table",
            name="users",
            qualified_name="db.users",
            summary="Accounts",
            signature="",
            body_hash="abc123",
        )
        chunks = split_units([unit])
        assert chunks[0].metadata["body_hash"] == "abc123"
