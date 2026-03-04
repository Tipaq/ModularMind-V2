"""Tests for the groups API (CRUD + members)."""

import pytest

from tests.conftest import make_user, persist_user

pytestmark = pytest.mark.asyncio


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
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": "Engineering", "slug": "engineering", "description": "Dev team"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Engineering"
    assert body["slug"] == "engineering"
    assert body["is_active"] is True


async def test_create_group_forbidden_for_regular_user(client):
    r = await client.post(
        "/api/v1/groups",
        json={"name": "Forbidden Group"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Get group detail
# ---------------------------------------------------------------------------


async def test_get_group(admin_client, client):
    # Create as admin
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": "Sales Team", "slug": "sales"},
    )
    group_id = r.json()["id"]

    # Get as regular user (any authenticated user can view)
    r = await client.get(f"/api/v1/groups/{group_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Sales Team"
    assert body["members"] == []


# ---------------------------------------------------------------------------
# Update group (admin only)
# ---------------------------------------------------------------------------


async def test_update_group(admin_client):
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": "Old Name", "slug": "old-name"},
    )
    group_id = r.json()["id"]

    r = await admin_client.put(
        f"/api/v1/groups/{group_id}",
        json={"name": "New Name", "description": "Updated"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


# ---------------------------------------------------------------------------
# Delete group (admin only)
# ---------------------------------------------------------------------------


async def test_delete_group(admin_client):
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": "To Delete", "slug": "to-delete"},
    )
    group_id = r.json()["id"]

    r = await admin_client.delete(f"/api/v1/groups/{group_id}")
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# Manage members (admin only)
# ---------------------------------------------------------------------------


async def test_add_and_remove_member(admin_client):
    from src.auth.models import UserRole

    # Create group
    r = await admin_client.post(
        "/api/v1/groups",
        json={"name": "Members Test", "slug": "members-test"},
    )
    group_id = r.json()["id"]

    # Create a target user
    target = make_user(UserRole.USER)
    await persist_user(target)

    # Add member
    r = await admin_client.post(
        f"/api/v1/groups/{group_id}/members",
        json={"user_id": target.id, "role": "member"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user_id"] == target.id
    assert body["role"] == "member"

    # Verify in group detail
    r = await admin_client.get(f"/api/v1/groups/{group_id}")
    assert r.status_code == 200
    assert len(r.json()["members"]) == 1

    # Remove member
    r = await admin_client.delete(f"/api/v1/groups/{group_id}/members/{target.id}")
    assert r.status_code == 204

    # Verify removed
    r = await admin_client.get(f"/api/v1/groups/{group_id}")
    assert len(r.json()["members"]) == 0
