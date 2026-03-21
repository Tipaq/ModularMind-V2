"""Network executor — HTTP request proxy with domain validation."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

import httpx

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_RESPONSE_SIZE = 1_048_576  # 1MB
ALLOWED_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"}
REQUEST_TIMEOUT = 30.0


class NetworkExecutor(BaseExecutor):
    """Execute HTTP requests with domain allow/deny enforcement.

    Runs directly in the gateway process (no sandbox needed).
    Domain validation is handled by the PermissionEngine before this is called.
    """

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        if action != "request":
            return f"Unknown network action: {action}"

        url = args.get("url", "")
        if not url:
            return "Error: url is required"

        # Validate URL
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return f"Error: unsupported scheme '{parsed.scheme}' (only http/https allowed)"
        if not parsed.hostname:
            return "Error: invalid URL — no hostname"

        # Block private/internal addresses
        error = await check_ssrf(parsed.hostname)
        if error:
            return error

        method = args.get("method", "GET").upper()
        if method not in ALLOWED_METHODS:
            return f"Error: unsupported HTTP method '{method}'"

        body = args.get("body")
        headers = args.get("headers") or {}

        # Strip dangerous headers
        for h in ("host", "cookie", "authorization"):
            headers.pop(h, None)
            headers.pop(h.title(), None)

        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                max_redirects=5,
                timeout=REQUEST_TIMEOUT,
            ) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    content=body.encode() if body else None,
                    headers=headers,
                )

            # Build result
            body_bytes = response.content
            if len(body_bytes) > MAX_RESPONSE_SIZE:
                body_text = body_bytes[:MAX_RESPONSE_SIZE].decode("utf-8", errors="replace")
                body_text += "\n... [response truncated at 1MB]"
            else:
                body_text = body_bytes.decode("utf-8", errors="replace")

            resp_headers = {k: v for k, v in response.headers.items() if k.lower() != "set-cookie"}

            return (
                f"HTTP {response.status_code} {response.reason_phrase}\n"
                f"Headers: {dict(resp_headers)}\n"
                f"Body:\n{body_text}"
            )

        except httpx.TimeoutException:
            return f"Error: request timed out after {REQUEST_TIMEOUT}s"
        except httpx.TooManyRedirects:
            return "Error: too many redirects (max 5)"
        except httpx.RequestError as e:
            return f"Error: request failed — {e}"


async def check_ssrf(hostname: str) -> str | None:
    """Block requests to private/internal addresses (SSRF protection)."""
    import ipaddress

    # Block obvious internal hostnames
    lower = hostname.lower()
    if lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return f"Error: requests to '{hostname}' are blocked (internal address)"

    if lower.endswith(".local") or lower.endswith(".internal"):
        return f"Error: requests to '{hostname}' are blocked (internal domain)"

    # Resolve hostname asynchronously and check for private IPs
    try:
        loop = asyncio.get_event_loop()
        results = await loop.getaddrinfo(hostname, None)
        for _family, _type, _proto, _canonname, sockaddr in results:
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return f"Error: '{hostname}' resolves to private IP {ip} (blocked)"
            # Block cloud metadata endpoint (AWS/GCP/Azure)
            if str(ip) == "169.254.169.254":
                return f"Error: '{hostname}' resolves to cloud metadata IP (blocked)"
    except OSError:
        return f"Error: cannot resolve hostname '{hostname}'"

    return None
