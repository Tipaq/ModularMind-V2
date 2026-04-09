"""Network executor — HTTP request proxy with domain validation."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import time
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

import httpx

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_RESPONSE_SIZE = 1_048_576  # 1MB
ALLOWED_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"}
REQUEST_TIMEOUT = 30.0
DNS_CACHE_TTL = 300  # 5 minutes

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=5,
            timeout=REQUEST_TIMEOUT,
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


async def execute_network(
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

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return f"Error: unsupported scheme '{parsed.scheme}' (only http/https allowed)"
    if not parsed.hostname:
        return "Error: invalid URL — no hostname"

    error = await check_ssrf(parsed.hostname)
    if error:
        return error

    method = args.get("method", "GET").upper()
    if method not in ALLOWED_METHODS:
        return f"Error: unsupported HTTP method '{method}'"

    body = args.get("body")
    headers = args.get("headers") or {}

    for h in ("host", "cookie", "authorization"):
        headers.pop(h, None)
        headers.pop(h.title(), None)

    try:
        client = get_http_client()
        response = await client.request(
            method=method,
            url=url,
            content=body.encode() if body else None,
            headers=headers,
        )

        body_bytes = response.content
        if len(body_bytes) > MAX_RESPONSE_SIZE:
            body_text = body_bytes[:MAX_RESPONSE_SIZE].decode("utf-8", errors="replace")
            body_text += "\n... [response truncated at 1MB]"
        else:
            body_text = body_bytes.decode("utf-8", errors="replace")

        resp_headers = dict(response.headers)
        resp_headers.pop("set-cookie", None)

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


MAX_DNS_CACHE_SIZE = 1024
_dns_cache: dict[str, tuple[str | None, float]] = {}
_dns_lock: asyncio.Lock | None = None


def _get_dns_lock() -> asyncio.Lock:
    global _dns_lock
    if _dns_lock is None:
        _dns_lock = asyncio.Lock()
    return _dns_lock


async def check_ssrf(hostname: str) -> str | None:
    lower = hostname.lower()

    async with _get_dns_lock():
        cached = _dns_cache.get(lower)
        if cached is not None:
            result, expiry = cached
            if time.monotonic() < expiry:
                return result

        result = await _resolve_and_check(lower, hostname)
        if len(_dns_cache) >= MAX_DNS_CACHE_SIZE:
            _dns_cache.clear()
        _dns_cache[lower] = (result, time.monotonic() + DNS_CACHE_TTL)
        return result


async def _resolve_and_check(lower: str, hostname: str) -> str | None:
    if lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return f"Error: requests to '{hostname}' are blocked (internal address)"

    if lower.endswith(".local") or lower.endswith(".internal"):
        return f"Error: requests to '{hostname}' are blocked (internal domain)"

    try:
        results = await asyncio.wait_for(
            asyncio.get_event_loop().getaddrinfo(hostname, None),
            timeout=5,
        )
        for _family, _type, _proto, _canonname, sockaddr in results:
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return f"Error: '{hostname}' resolves to private IP {ip} (blocked)"
            if str(ip) == "169.254.169.254":
                return f"Error: '{hostname}' resolves to cloud metadata IP (blocked)"
    except OSError:
        return f"Error: cannot resolve hostname '{hostname}'"

    return None
