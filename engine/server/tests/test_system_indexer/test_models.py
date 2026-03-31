"""Tests for system_indexer Pydantic models."""

from src.system_indexer.models import Relationship, StructuralUnit, SystemIndex


class TestStructuralUnit:
    def test_minimal_creation(self):
        unit = StructuralUnit(
            id="u1",
            system_id="s1",
            kind="table",
            name="users",
            qualified_name="db.users",
            summary="User accounts",
            signature="CREATE TABLE users (...)",
        )
        assert unit.depth == 0
        assert unit.parent_id is None
        assert unit.metadata == {}
        assert unit.body_hash is None

    def test_child_unit(self):
        unit = StructuralUnit(
            id="u2",
            system_id="s1",
            kind="field",
            name="email",
            qualified_name="db.users.email",
            summary="User email address",
            signature="VARCHAR(255)",
            depth=1,
            parent_id="u1",
        )
        assert unit.depth == 1
        assert unit.parent_id == "u1"


class TestRelationship:
    def test_creation(self):
        rel = Relationship(
            source_id="u1",
            target_id="u2",
            kind="has_field",
        )
        assert rel.weight == 1.0
        assert rel.metadata == {}

    def test_weight_bounds(self):
        rel = Relationship(
            source_id="u1",
            target_id="u2",
            kind="foreign_key",
            weight=0.5,
        )
        assert rel.weight == 0.5


class TestSystemIndex:
    def test_creation(self, sample_units, sample_relationships):
        index = SystemIndex(
            system_id="s1",
            units=sample_units,
            relationships=sample_relationships,
        )
        assert len(index.units) == 5
        assert len(index.relationships) == 3
