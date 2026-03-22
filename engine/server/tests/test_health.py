"""Tests for the health endpoint."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_health_endpoint(admin_client):
    r = await admin_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" or "status" in body
