"""URL validation for MCP server configuration.

Delegates to the shared SSRF validation utility in infra.url_validation.
"""

from src.infra.url_validation import validate_url_ssrf


def validate_mcp_url(url: str) -> str | None:
    """Validate an MCP server URL. Returns error message or None if valid.

    Blocks:
    - Non-HTTP(S) schemes
    - URLs with embedded credentials
    - Localhost and loopback addresses (IPv4 and IPv6)
    - Private IP ranges (10.x, 172.16-31.x, 192.168.x, fc00::/7)
    - Link-local addresses (169.254.x.x, fe80::/10)
    - Cloud metadata endpoints
    - Internal/local hostnames
    - DNS rebinding (hostname resolving to private IP)
    """
    return validate_url_ssrf(url)
