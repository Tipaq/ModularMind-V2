"""AutomationToolExecutor — routes automation__ tool calls to Platform API.

Matches MCPToolExecutor.execute(name, args) -> str interface.
Calls Platform CRUD endpoints using PLATFORM_URL + ENGINE_API_KEY auth.
"""

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

AUTOMATION_TOOL_PREFIX = "automation__"


class AutomationToolExecutor:
    """Executes automation tool calls by proxying to Platform API."""

    def __init__(self, platform_url: str, engine_api_key: str):
        self._url = platform_url.rstrip("/")
        self._key = engine_api_key

    def _headers(self) -> dict[str, str]:
        return {
            "X-Engine-Key": self._key,
            "Content-Type": "application/json",
        }

    async def execute(self, name: str, args: dict[str, Any]) -> str:
        action = name.removeprefix(AUTOMATION_TOOL_PREFIX)
        try:
            handler = getattr(self, f"_handle_{action}", None)
            if not handler:
                return json.dumps({"error": f"Unknown automation tool: {name}"})
            return await handler(args)
        except httpx.HTTPStatusError as e:
            logger.warning("Automation tool %s HTTP error: %s", name, e.response.text)
            return json.dumps({"error": f"HTTP {e.response.status_code}: {e.response.text}"})
        except Exception as e:
            logger.exception("Automation tool %s failed", name)
            return json.dumps({"error": str(e)})

    async def _handle_list(self, args: dict) -> str:
        params: dict[str, str] = {"page": "1", "page_size": "50"}
        if args.get("search"):
            params["search"] = args["search"]
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._url}/api/automations",
                params=params,
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_get(self, args: dict) -> str:
        aid = args["id"]
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._url}/api/automations/{aid}",
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_create(self, args: dict) -> str:
        body = {
            "name": args["name"],
            "description": args.get("description", ""),
            "config": args.get("config", {}),
            "tags": args.get("tags", []),
        }
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self._url}/api/automations",
                json=body,
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_update(self, args: dict) -> str:
        aid = args.pop("id")
        body = {k: v for k, v in args.items() if v is not None}
        async with httpx.AsyncClient() as client:
            r = await client.patch(
                f"{self._url}/api/automations/{aid}",
                json=body,
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_toggle(self, args: dict) -> str:
        aid = args["id"]
        async with httpx.AsyncClient() as client:
            r = await client.patch(
                f"{self._url}/api/automations/{aid}",
                json={"enabled": args["enabled"]},
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_delete(self, args: dict) -> str:
        aid = args["id"]
        async with httpx.AsyncClient() as client:
            r = await client.delete(
                f"{self._url}/api/automations/{aid}",
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_runs(self, args: dict) -> str:
        aid = args["id"]
        limit = args.get("limit", 10)
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self._url}/api/automations/{aid}/runs",
                params={"limit": str(limit)},
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text

    async def _handle_trigger(self, args: dict) -> str:
        aid = args["id"]
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self._url}/api/automations/{aid}/trigger",
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.text
