"""Tests for the groups API (CRUD + members)."""

from uuid import uuid4

import pytest

from tests.conftest import make_user, persist_user

pytestmark = pytest.mark.asyncio


def _unique(prefix: str = "test") -> tuple[str, str]:
    tag = uuid4().hex[:8]
    return f"{prefix}-{tag}", f"{prefix}-{tag}"


# ---------------------------------------------------------------------------
# List groups
# ---------------------------------------------------------------------------


async def test_list_groups_empty(client):
    r = await client.get("/api/v1/groups")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# Create group (admin only)
# ---------------------------------------------------------------------------


async def test_create_group(admin_client):
    name, slug = _unique("engineering")
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug, "description": "Dev team"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == name
    assert body["slug"] == slug
    assert body["is_active"] is True


async def test_create_group_forbidden_for_regular_user(client):
    name, slug = _unique("forbidden")
    r = await client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Get group detail
# ---------------------------------------------------------------------------


async def test_get_group(admin_client, client):
    name, slug = _unique("sales")
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug},
    )
    group_id = r.json()["id"]

    r = await client.get(f"/api/v1/groups/{group_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == name
    assert body["members"] == []


# ---------------------------------------------------------------------------
# Update group (admin only)
# ---------------------------------------------------------------------------


async def test_update_group(admin_client):
    name, slug = _unique("old-name")
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug},
    )
    group_id = r.json()["id"]

    new_name = f"new-{uuid4().hex[:8]}"
    r = await admin_client.put(
        f"/api/v1/groups/{group_id}",
        json={"name": new_name, "description": "Updated"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == new_name


# ---------------------------------------------------------------------------
# Delete group (admin only)
# ---------------------------------------------------------------------------


async def test_delete_group(admin_client):
    name, slug = _unique("to-delete")
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug},
    )
    group_id = r.json()["id"]

    r = await admin_client.delete(f"/api/v1/groups/{group_id}")
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# Manage members (admin only)
# ---------------------------------------------------------------------------


async def test_add_and_remove_member(admin_client):
    from src.auth.models import UserRole

    name, slug = _unique("members-test")
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": name, "slug": slug},
    )
    group_id = r.json()["id"]

    target = make_user(UserRole.USER)
    await persist_user(target)

    r = await admin_client.post(
        f"/api/v1/groups/{group_id}/members",
        json={"user_id": target.id, "role": "member"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user_id"] == target.id
    assert body["role"] == "member"

    r = await admin_client.get(f"/api/v1/groups/{group_id}")
    assert r.status_code == 200
    assert len(r.json()["members"]) == 1

    r = await admin_client.delete(f"/api/v1/groups/{group_id}/members/{target.id}")
    assert r.status_code == 204

    r = await admin_client.get(f"/api/v1/groups/{group_id}")
    assert len(r.json()["members"]) == 0
