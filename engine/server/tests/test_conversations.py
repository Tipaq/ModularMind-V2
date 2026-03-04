"""Tests for the conversations API (CRUD)."""

import pytest

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# List conversations
# ---------------------------------------------------------------------------


async def test_list_conversations_empty(client):
    r = await client.get("/api/v1/conversations")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_list_conversations_pagination(client):
    # Create 3 conversations
    for i in range(3):
        r = await client.post(
            "/api/v1/conversations",
            json={"agent_id": f"agent-{i}", "title": f"Conv {i}"},
        )
        assert r.status_code == 201

    # Default page
    r = await client.get("/api/v1/conversations")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3

    # Page with limit
    r = await client.get("/api/v1/conversations?page=1&page_size=2")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2


# ---------------------------------------------------------------------------
# Create conversation
# ---------------------------------------------------------------------------


async def test_create_conversation(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-test-1", "title": "My Test Conv"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["agent_id"] == "agent-test-1"
    assert body["title"] == "My Test Conv"
    assert body["message_count"] == 0
    assert body["supervisor_mode"] is False
    assert "id" in body
    assert "created_at" in body


async def test_create_conversation_supervisor_mode(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"supervisor_mode": True, "title": "Supervisor Conv"},
    )
    assert r.status_code == 201
    assert r.json()["supervisor_mode"] is True


async def test_create_conversation_requires_agent_or_supervisor(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"title": "No agent, no supervisor"},
    )
    assert r.status_code == 400
    assert "agent_id" in r.json()["detail"].lower() or "supervisor" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Get conversation
# ---------------------------------------------------------------------------


async def test_get_conversation(client):
    # Create first
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-get-1", "title": "Get Me"},
    )
    conv_id = r.json()["id"]

    # Get it
    r = await client.get(f"/api/v1/conversations/{conv_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == conv_id
    assert body["title"] == "Get Me"
    assert body["messages"] == []


async def test_get_conversation_not_found(client):
    r = await client.get("/api/v1/conversations/nonexistent-id")
    assert r.status_code == 404


async def test_get_conversation_access_denied(client, admin_client):
    """A different user cannot access another user's conversation."""
    # Create as regular user
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-private", "title": "Private"},
    )
    conv_id = r.json()["id"]

    # Try to access as admin (different user)
    r = await admin_client.get(f"/api/v1/conversations/{conv_id}")
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Update conversation
# ---------------------------------------------------------------------------


async def test_update_conversation(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-update-1", "title": "Old Title"},
    )
    conv_id = r.json()["id"]

    r = await client.patch(
        f"/api/v1/conversations/{conv_id}",
        json={"title": "New Title"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "New Title"


async def test_update_conversation_config(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-cfg-1"},
    )
    conv_id = r.json()["id"]

    r = await client.patch(
        f"/api/v1/conversations/{conv_id}",
        json={"config": {"model_id": "openai:gpt-4"}},
    )
    assert r.status_code == 200
    assert r.json()["config"]["model_id"] == "openai:gpt-4"


# ---------------------------------------------------------------------------
# Delete conversation
# ---------------------------------------------------------------------------


async def test_delete_conversation(client):
    r = await client.post(
        "/api/v1/conversations",
        json={"agent_id": "agent-delete-1", "title": "Delete Me"},
    )
    conv_id = r.json()["id"]

    r = await client.delete(f"/api/v1/conversations/{conv_id}")
    assert r.status_code == 204

    # Verify it's gone
    r = await client.get(f"/api/v1/conversations/{conv_id}")
    assert r.status_code == 404


async def test_delete_conversation_not_found(client):
    r = await client.delete("/api/v1/conversations/nonexistent-id")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Filter by agent_id
# ---------------------------------------------------------------------------


async def test_list_conversations_filter_by_agent(client):
    await client.post("/api/v1/conversations", json={"agent_id": "agent-filter-a"})
    await client.post("/api/v1/conversations", json={"agent_id": "agent-filter-b"})

    r = await client.get("/api/v1/conversations?agent_id=agent-filter-a")
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(c["agent_id"] == "agent-filter-a" for c in items)
