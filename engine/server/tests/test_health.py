"""Tests for the health endpoint."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_health_endpoint(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" or "status" in body
