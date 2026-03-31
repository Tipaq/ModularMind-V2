"""Fixtures for system_indexer tests."""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.system_indexer.models import Relationship, StructuralUnit, SystemIndex

SYSTEM_ID = "test-system-001"


def make_unit(
    name: str,
    kind: str = "entity",
    depth: int = 0,
    parent_id: str | None = None,
    body_hash: str | None = None,
) -> StructuralUnit:
    uid = str(uuid4())
    return StructuralUnit(
        id=uid,
        system_id=SYSTEM_ID,
        kind=kind,
        name=name,
        qualified_name=f"test.{name}",
        summary=f"Summary of {name}",
        signature=f"type {name} {{ ... }}",
        body_hash=body_hash or f"hash_{name}",
        depth=depth,
        parent_id=parent_id,
        metadata={"test": True},
    )


def make_relationship(
    source: StructuralUnit,
    target: StructuralUnit,
    kind: str = "has_field",
) -> Relationship:
    return Relationship(
        source_id=source.id,
        target_id=target.id,
        kind=kind,
        weight=1.0,
        metadata={},
    )


@pytest.fixture()
def sample_units() -> list[StructuralUnit]:
    parent = make_unit("users", kind="table")
    child1 = make_unit("id", kind="field", depth=1, parent_id=parent.id)
    child2 = make_unit("email", kind="field", depth=1, parent_id=parent.id)
    orders = make_unit("orders", kind="table")
    products = make_unit("products", kind="table")
    return [parent, child1, child2, orders, products]


@pytest.fixture()
def sample_relationships(sample_units: list[StructuralUnit]) -> list[Relationship]:
    users, uid, email, orders, products = sample_units
    return [
        make_relationship(users, uid),
        make_relationship(users, email),
        make_relationship(orders, users, kind="foreign_key"),
    ]


@pytest.fixture()
def sample_index(
    sample_units: list[StructuralUnit],
    sample_relationships: list[Relationship],
) -> SystemIndex:
    return SystemIndex(
        system_id=SYSTEM_ID,
        units=sample_units,
        relationships=sample_relationships,
    )
