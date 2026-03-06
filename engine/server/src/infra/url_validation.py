"""URL validation utilities for SSRF prevention.

Shared validation logic used by MCP, webhooks, and LLM provider URLs.
Blocks access to internal networks, cloud metadata endpoints, and
dangerous URL patterns.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_BLOCKED_HOSTNAMES = frozenset({
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254",  # AWS/GCP metadata
    "metadata.google.internal",  # GCP metadata
    "100.100.100.200",  # Alibaba Cloud metadata
    "::1",
    "::ffff:127.0.0.1",
})

_BLOCKED_SUFFIXES = (".internal", ".local", ".localhost")


def _is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private, loopback, or link-local."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
        )
    except ValueError:
        return False


def validate_url_ssrf(
    url: str,
    *,
    allow_private: bool = False,
    resolve_dns: bool = True,
) -> str | None:
    """Validate a URL for SSRF vulnerabilities.

    Returns error message string if the URL is unsafe, None if valid.

    Blocks:
    - Non-HTTP(S) schemes
    - URLs with userinfo (user:pass@host)
    - Localhost and loopback addresses (IPv4 and IPv6)
    - Private IP ranges (10.x, 172.16-31.x, 192.168.x, fc00::/7)
    - Link-local addresses (169.254.x.x, fe80::/10)
    - Cloud metadata endpoints
    - Internal/local hostname suffixes
    - DNS resolution to private IPs (DNS rebinding defense)

    Args:
        url: URL to validate
        allow_private: If True, skip private IP checks (for LLM URLs in
            Docker environments where Ollama may be on a Docker network)
        resolve_dns: If True, resolve hostname and check resolved IP
    """
    if not url or not url.strip():
        return "URL is empty"

    parsed = urlparse(url)

    # Scheme check
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        return "Only http/https URLs are allowed"

    # Block URLs with userinfo (credentials in URL)
    if parsed.username or parsed.password:
        return "URLs with embedded credentials are not allowed"

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return "URL must have a hostname"

    # Strip IPv6 brackets for validation
    bare_host = hostname.strip("[]")

    # Check blocked hostnames
    if bare_host in _BLOCKED_HOSTNAMES:
        return f"Blocked hostname: {bare_host}"

    # Check blocked suffixes
    for suffix in _BLOCKED_SUFFIXES:
        if bare_host.endswith(suffix):
            return f"Blocked hostname suffix: {suffix}"

    if not allow_private:
        # Direct IP check (handles both IPv4 and IPv6)
        if _is_private_ip(bare_host):
            return f"Private/reserved IP address not allowed: {bare_host}"

        # DNS resolution check (defense against DNS rebinding)
        if resolve_dns and not _is_ip_literal(bare_host):
            try:
                resolved_ips = socket.getaddrinfo(
                    bare_host, None, socket.AF_UNSPEC, socket.SOCK_STREAM,
                )
                for family, _, _, _, sockaddr in resolved_ips:
                    ip = sockaddr[0]
                    if _is_private_ip(ip):
                        return (
                            f"Hostname '{bare_host}' resolves to private IP "
                            f"{ip} — possible DNS rebinding"
                        )
            except socket.gaierror:
                # DNS resolution failed — allow (the actual HTTP call will
                # fail with a clear error)
                pass
            except OSError as e:
                logger.warning("DNS resolution check failed for %s: %s", bare_host, e)

    return None


def _is_ip_literal(hostname: str) -> bool:
    """Check if hostname is an IP literal (not a DNS name)."""
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False
