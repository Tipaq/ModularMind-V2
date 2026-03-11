"""Browser executor — fetch URL and extract readable text content, plus web search."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

import httpx

from src.executors.base import BaseExecutor

if TYPE_CHECKING:
    from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

MAX_CONTENT_SIZE = 2_097_152  # 2MB raw HTML
MAX_TEXT_OUTPUT = 50_000  # ~50k chars of extracted text
MAX_SEARCH_RESULTS = 25
DEFAULT_TIMEOUT = 30.0

# Tags whose content should be removed entirely
STRIP_TAGS = re.compile(
    r"<(script|style|noscript|svg|iframe|object|embed)[^>]*>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)
# All remaining HTML tags
HTML_TAGS = re.compile(r"<[^>]+>")
# Consecutive blank lines
BLANK_LINES = re.compile(r"\n{3,}")

# User-Agent matching a standard browser (some sites block non-browser UAs)
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 ModularMind-Gateway/1.0"
)


class BrowserExecutor(BaseExecutor):
    """Fetch a URL and return page content as readable text.

    This is a lightweight implementation using httpx + HTML text extraction.
    For JavaScript-heavy pages, a Playwright-based upgrade can be added later.
    """

    async def execute(
        self,
        action: str,
        args: dict[str, Any],
        sandbox_mgr: SandboxManager,
        execution_id: str,
    ) -> str:
        if action == "search":
            return await self._search_duckduckgo(args)
        if action != "browse":
            return f"Unknown browser action: {action}"

        url = args.get("url", "")
        if not url:
            return "Error: url is required"

        # Validate URL
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return f"Error: unsupported scheme '{parsed.scheme}' (only http/https allowed)"
        if not parsed.hostname:
            return "Error: invalid URL — no hostname"

        # SSRF protection (reuse from network executor)
        from src.executors.network import _check_ssrf

        ssrf_error = _check_ssrf(parsed.hostname)
        if ssrf_error:
            return ssrf_error

        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                max_redirects=5,
                timeout=DEFAULT_TIMEOUT,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            ) as client:
                response = await client.get(url)

            content_type = response.headers.get("content-type", "")
            status = response.status_code

            if status >= 400:
                return f"Error: HTTP {status} {response.reason_phrase} for {url}"

            raw = response.content
            if len(raw) > MAX_CONTENT_SIZE:
                raw = raw[:MAX_CONTENT_SIZE]

            # If not HTML, return raw text (truncated)
            if "html" not in content_type.lower():
                text = raw.decode("utf-8", errors="replace")
                if len(text) > MAX_TEXT_OUTPUT:
                    text = text[:MAX_TEXT_OUTPUT] + "\n... [content truncated]"
                return f"URL: {url}\nContent-Type: {content_type}\n\n{text}"

            # Extract readable text from HTML
            html = raw.decode("utf-8", errors="replace")
            text = _extract_text(html)

            # Extract title
            title = _extract_title(html)

            if len(text) > MAX_TEXT_OUTPUT:
                text = text[:MAX_TEXT_OUTPUT] + "\n... [content truncated]"

            header = f"URL: {url}\nTitle: {title}\n"
            return f"{header}\n{text}"

        except httpx.TimeoutException:
            return f"Error: page load timed out after {DEFAULT_TIMEOUT}s"
        except httpx.TooManyRedirects:
            return "Error: too many redirects (max 5)"
        except httpx.RequestError as e:
            return f"Error: request failed — {e}"

    async def _search_duckduckgo(self, args: dict[str, Any]) -> str:
        """Search the web via DuckDuckGo and return formatted results."""
        import asyncio

        from ddgs import DDGS

        query = args.get("query", "").strip()
        if not query:
            return "Error: query is required"

        max_results = min(int(args.get("max_results", 10)), MAX_SEARCH_RESULTS)
        safesearch = args.get("safesearch", "moderate")

        try:
            # ddgs is sync — run in thread to avoid blocking
            def _do_search() -> list[dict]:
                with DDGS() as ddgs:
                    return list(
                        ddgs.text(
                            query,
                            max_results=max_results,
                            safesearch=safesearch,
                        )
                    )

            results = await asyncio.to_thread(_do_search)

            if not results:
                return f"No results found for: {query}"

            lines = [f"Search results for: {query}\n"]
            for i, r in enumerate(results, 1):
                lines.append(f"{i}. {r.get('title', '(no title)')}")
                lines.append(f"   URL: {r.get('href', '')}")
                body = r.get("body", "")
                if body:
                    lines.append(f"   {body}")
                lines.append("")

            return "\n".join(lines).strip()

        except Exception as e:
            logger.warning("DuckDuckGo search failed: %s", e)
            return f"Error: search failed — {e}"


def _extract_title(html: str) -> str:
    """Extract <title> text from HTML."""
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return "(no title)"


def _extract_text(html: str) -> str:
    """Extract readable text from HTML — lightweight readability.

    Strips scripts/styles, removes tags, collapses whitespace.
    """
    text = html

    # Remove script, style, and other non-content tags
    text = STRIP_TAGS.sub("", text)

    # Convert common block elements to newlines
    for tag in ("p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "dt", "dd"):
        text = re.sub(rf"<{tag}[^>]*>", "\n", text, flags=re.IGNORECASE)

    # Convert hr to separator
    text = re.sub(r"<hr[^>]*>", "\n---\n", text, flags=re.IGNORECASE)

    # Strip remaining HTML tags
    text = HTML_TAGS.sub("", text)

    # Decode common HTML entities
    text = (
        text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )

    # Clean up whitespace
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            lines.append(stripped)
        else:
            lines.append("")

    text = "\n".join(lines)
    text = BLANK_LINES.sub("\n\n", text)

    return text.strip()
