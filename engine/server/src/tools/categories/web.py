"""Web tools — search, browse, screenshot, and link extraction.

Executes directly in the engine process (no gateway needed).
Multi-provider search with DuckDuckGo as free default.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import socket
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

WEB_TIMEOUT = 30.0
MAX_OUTPUT = 50_000
MAX_LINKS = 200
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def get_web_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for the web category."""
    return [
        _tool("web_search", "Search the web. Uses DuckDuckGo by default, or Brave/Tavily/Serper if configured.", {
            "query": _str("Search query"),
            "provider": _str("Provider: auto, duckduckgo, brave, tavily, serper (default: auto)"),
            "max_results": _int("Max results to return (1-20, default: 10)"),
        }, ["query"]),
        _tool("browse_url", "Fetch a web page and extract its content as clean markdown or text.", {
            "url": _str("URL to browse"),
            "format": _str("Output format: markdown, text, raw (default: markdown)"),
            "render_js": {"type": "boolean", "description": "Render JavaScript via headless browser (default: false). Requires Puppeteer MCP."},
        }, ["url"]),
        _tool("screenshot_url", "Take a screenshot of a web page. Requires Puppeteer MCP server.", {
            "url": _str("URL to capture"),
            "width": _int("Viewport width in pixels (default: 1280)"),
            "height": _int("Viewport height in pixels (default: 720)"),
            "full_page": {"type": "boolean", "description": "Capture full page height (default: false)"},
        }, ["url"]),
        _tool("extract_links", "Extract all links from a web page with optional regex filtering.", {
            "url": _str("URL to extract links from"),
            "filter": _str("Regex pattern to filter URLs (optional)"),
            "max_links": _int("Max links to return (1-200, default: 50)"),
        }, ["url"]),
    ]


async def execute_web_tool(
    name: str,
    args: dict[str, Any],
    search_api_keys: dict[str, str] | None = None,
    mcp_executor: Any | None = None,
) -> str:
    """Execute a web tool call."""
    handler = _HANDLERS.get(name)
    if not handler:
        return f"Error: unknown web tool '{name}'"
    try:
        if name == "web_search":
            return await handler(args, search_api_keys or {})
        if name in ("screenshot_url", "browse_url") and args.get("render_js"):
            return await handler(args, mcp_executor)
        return await handler(args)
    except httpx.TimeoutException:
        return "Error: request timed out."
    except Exception as e:
        logger.exception("Web tool '%s' failed", name)
        return f"Error: {e}"


# ---------------------------------------------------------------------------
# SSRF protection
# ---------------------------------------------------------------------------

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "metadata.google.internal"}


def _check_ssrf(url: str) -> str | None:
    """Return error string if URL targets a private/internal address."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    if hostname in _BLOCKED_HOSTS:
        return f"Blocked: {hostname} is not allowed"
    if hostname.endswith((".local", ".internal")):
        return f"Blocked: {hostname} is an internal domain"

    try:
        for info in socket.getaddrinfo(hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return f"Blocked: {hostname} resolves to private IP {ip}"
            if str(ip) == "169.254.169.254":
                return f"Blocked: cloud metadata endpoint"
    except socket.gaierror:
        return f"Error: cannot resolve hostname '{hostname}'"

    return None


def _http_headers() -> dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"}


# ---------------------------------------------------------------------------
# web_search
# ---------------------------------------------------------------------------

class _SearchRateLimitError(Exception):
    """Raised when a search provider returns 429."""


async def _web_search(args: dict, api_keys: dict[str, str]) -> str:
    query = args.get("query", "").strip()
    if not query:
        return "Error: query is required."

    max_results = min(max(int(args.get("max_results", 10)), 1), 20)
    provider = args.get("provider", "auto")

    if provider == "auto":
        provider = _pick_provider(api_keys)

    # Try the selected provider, fallback to DuckDuckGo on rate limit
    try:
        if provider == "brave" and api_keys.get("brave"):
            return await _search_brave(query, max_results, api_keys["brave"])
        if provider == "tavily" and api_keys.get("tavily"):
            return await _search_tavily(query, max_results, api_keys["tavily"])
        if provider == "serper" and api_keys.get("serper"):
            return await _search_serper(query, max_results, api_keys["serper"])
    except _SearchRateLimitError:
        logger.warning("Search provider '%s' rate limited, falling back to DuckDuckGo", provider)

    return await _search_duckduckgo(query, max_results)


def _pick_provider(api_keys: dict[str, str]) -> str:
    for provider in ("brave", "tavily", "serper"):
        if api_keys.get(provider):
            return provider
    return "duckduckgo"


async def _search_duckduckgo(query: str, max_results: int) -> str:
    from duckduckgo_search import DDGS

    def _do():
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))

    results = await asyncio.to_thread(_do)
    return _format_search_results(query, results, "DuckDuckGo")


async def _search_brave(query: str, max_results: int, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=WEB_TIMEOUT) as client:
        resp = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": str(max_results)},
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
        )
        if resp.status_code == 429:
            raise _SearchRateLimitError("Brave rate limit exceeded")
        resp.raise_for_status()
        data = resp.json()

    results = [
        {"title": r.get("title", ""), "href": r.get("url", ""), "body": r.get("description", "")}
        for r in data.get("web", {}).get("results", [])
    ]
    return _format_search_results(query, results, "Brave")


async def _search_tavily(query: str, max_results: int, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=WEB_TIMEOUT) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={"query": query, "max_results": max_results, "api_key": api_key},
        )
        if resp.status_code == 429:
            raise _SearchRateLimitError("Tavily rate limit exceeded")
        resp.raise_for_status()
        data = resp.json()

    results = [
        {"title": r.get("title", ""), "href": r.get("url", ""), "body": r.get("content", "")}
        for r in data.get("results", [])
    ]
    return _format_search_results(query, results, "Tavily")


async def _search_serper(query: str, max_results: int, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=WEB_TIMEOUT) as client:
        resp = await client.post(
            "https://google.serper.dev/search",
            json={"q": query, "num": max_results},
            headers={"X-API-KEY": api_key},
        )
        if resp.status_code == 429:
            raise _SearchRateLimitError("Serper rate limit exceeded")
        resp.raise_for_status()
        data = resp.json()

    results = [
        {"title": r.get("title", ""), "href": r.get("link", ""), "body": r.get("snippet", "")}
        for r in data.get("organic", [])
    ]
    return _format_search_results(query, results, "Serper")


def _format_search_results(
    query: str, results: list[dict], provider: str
) -> str:
    if not results:
        return f"No results found for: {query}"

    lines = [f"Search results for: {query} (via {provider})\n"]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r.get('title', '(no title)')}")
        lines.append(f"   URL: {r.get('href', '')}")
        body = r.get("body", "")
        if body:
            lines.append(f"   {body[:300]}")
        lines.append("")
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# browse_url
# ---------------------------------------------------------------------------

async def _browse_url(args: dict, mcp_executor: Any | None = None) -> str:
    url = args.get("url", "").strip()
    if not url:
        return "Error: url is required."
    if not url.startswith(("http://", "https://")):
        return "Error: URL must start with http:// or https://"

    ssrf_err = _check_ssrf(url)
    if ssrf_err:
        return ssrf_err

    render_js = args.get("render_js", False)
    output_format = args.get("format", "markdown")

    if render_js:
        if not mcp_executor:
            return "Error: render_js requires Puppeteer MCP server to be deployed."
        return await _browse_with_puppeteer(url, mcp_executor)

    async with httpx.AsyncClient(
        timeout=WEB_TIMEOUT, follow_redirects=True, max_redirects=5
    ) as client:
        resp = await client.get(url, headers=_http_headers())
        resp.raise_for_status()

    html = resp.text
    if not html:
        return "Error: empty response from URL."

    if output_format == "raw":
        return html[:MAX_OUTPUT]

    if output_format == "text":
        return _extract_text_simple(html)[:MAX_OUTPUT]

    return _extract_markdown(html, url)[:MAX_OUTPUT]


async def _browse_with_puppeteer(url: str, mcp_executor: Any) -> str:
    """Use MCP Puppeteer to render JS and extract content."""
    try:
        result = await mcp_executor.execute("puppeteer_navigate", {"url": url})
        content = await mcp_executor.execute("puppeteer_evaluate", {
            "script": "document.body.innerText"
        })
        return content[:MAX_OUTPUT] if content else result[:MAX_OUTPUT]
    except Exception as e:
        return f"Error: Puppeteer navigation failed: {e}"


def _extract_markdown(html: str, base_url: str) -> str:
    """Extract content as markdown using trafilatura."""
    try:
        import trafilatura
        result = trafilatura.extract(
            html, output_format="markdown", include_links=True, include_tables=True,
        )
        return result if result else _extract_text_simple(html)
    except ImportError:
        logger.warning("trafilatura not installed, falling back to simple extraction")
        return _extract_text_simple(html)


def _extract_text_simple(html: str) -> str:
    """Lightweight HTML to text extraction (no dependencies)."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<(br|hr|p|div|h[1-6]|li|tr)[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# screenshot_url
# ---------------------------------------------------------------------------

async def _screenshot_url(args: dict, mcp_executor: Any | None = None) -> str:
    url = args.get("url", "").strip()
    if not url:
        return "Error: url is required."

    ssrf_err = _check_ssrf(url)
    if ssrf_err:
        return ssrf_err

    if not mcp_executor:
        return "Error: screenshot_url requires Puppeteer MCP server to be deployed."

    width = args.get("width", 1280)
    height = args.get("height", 720)

    try:
        await mcp_executor.execute("puppeteer_navigate", {"url": url})
        result = await mcp_executor.execute("puppeteer_screenshot", {
            "width": width,
            "height": height,
        })
        return result
    except Exception as e:
        return f"Error: screenshot failed: {e}"


# ---------------------------------------------------------------------------
# extract_links
# ---------------------------------------------------------------------------

async def _extract_links(args: dict) -> str:
    url = args.get("url", "").strip()
    if not url:
        return "Error: url is required."

    ssrf_err = _check_ssrf(url)
    if ssrf_err:
        return ssrf_err

    link_filter = args.get("filter", "")
    max_links = min(max(int(args.get("max_links", 50)), 1), MAX_LINKS)

    async with httpx.AsyncClient(
        timeout=WEB_TIMEOUT, follow_redirects=True, max_redirects=5
    ) as client:
        resp = await client.get(url, headers=_http_headers())
        resp.raise_for_status()

    html = resp.text
    pattern = re.compile(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
    matches = pattern.findall(html)

    links = []
    seen = set()
    for href, text in matches:
        resolved = urljoin(url, href)
        if resolved in seen:
            continue
        if not resolved.startswith(("http://", "https://")):
            continue
        if link_filter:
            try:
                if not re.search(link_filter, resolved):
                    continue
            except re.error:
                return f"Error: invalid regex filter '{link_filter}'"

        seen.add(resolved)
        clean_text = re.sub(r"<[^>]+>", "", text).strip()
        links.append({"url": resolved, "text": clean_text[:200]})
        if len(links) >= max_links:
            break

    return json.dumps(links, indent=2, ensure_ascii=False)


_HANDLERS: dict[str, Any] = {
    "web_search": _web_search,
    "browse_url": _browse_url,
    "screenshot_url": _screenshot_url,
    "extract_links": _extract_links,
}


# ---------------------------------------------------------------------------
# Definition helpers
# ---------------------------------------------------------------------------

def _str(desc: str) -> dict:
    return {"type": "string", "description": desc}


def _int(desc: str) -> dict:
    return {"type": "integer", "description": desc}


def _tool(name: str, desc: str, props: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": desc,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        },
    }
