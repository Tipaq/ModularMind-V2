"""Outbound connector executor — executes tool calls defined in Connector.spec."""

import ipaddress
import logging
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from src.connectors.models import Connector

logger = logging.getLogger(__name__)

OUTBOUND_TIMEOUT_SECONDS = 30

BLOCKED_HOSTS = frozenset({
    "localhost",
    "metadata.google.internal",
    "instance-data",
})

BLOCKED_PORTS = frozenset({5432, 6379, 8000, 8001, 8200, 6333, 9000})


def _is_blocked_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    if hostname in BLOCKED_HOSTS:
        return True

    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return True
    except ValueError:
        pass

    return bool(parsed.port and parsed.port in BLOCKED_PORTS)


class OutboundConnectorExecutor:
    """Executes outbound tool calls defined in Connector.spec.outbound.tools."""

    def list_actions(self, connector: Connector) -> list[dict]:
        spec = connector.spec or {}
        outbound = spec.get("outbound", {})
        tools = outbound.get("tools", [])

        actions = []
        for tool in tools:
            actions.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {
                        "type": "object",
                        "properties": {},
                    }),
                },
            })
        return actions

    async def execute_action(
        self,
        connector: Connector,
        action_name: str,
        params: dict,
        decrypted_credentials: dict[str, str],
    ) -> dict:
        spec = connector.spec or {}
        base_url = spec.get("base_url", "")
        outbound = spec.get("outbound", {})
        tools = outbound.get("tools", [])

        tool_def = next(
            (t for t in tools if t["name"] == action_name), None
        )
        if not tool_def:
            raise HTTPException(
                status_code=404,
                detail=f"Action '{action_name}' not found in connector spec",
            )

        url = f"{base_url.rstrip('/')}{tool_def['path']}"
        if _is_blocked_url(url):
            raise HTTPException(
                status_code=403,
                detail=f"Blocked URL: {url}",
            )

        method = tool_def.get("method", "POST").upper()

        if method == "SMTP":
            return await _send_smtp_email(
                tool_def, params, decrypted_credentials, connector.id
            )

        headers = _build_auth_headers(
            spec, tool_def, decrypted_credentials
        )
        body = _apply_request_mapping(
            tool_def.get("request_mapping"), params
        )
        response_path = tool_def.get("response_path")

        logger.info(
            "Outbound connector call: %s %s (connector=%s)",
            method,
            url,
            connector.id[:8],
        )

        try:
            async with httpx.AsyncClient(
                timeout=OUTBOUND_TIMEOUT_SECONDS
            ) as client:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if method in ("POST", "PUT", "PATCH") else None,
                    params=body if method == "GET" else None,
                )

            if resp.status_code >= 400:
                return {
                    "error": True,
                    "status": resp.status_code,
                    "body": resp.text[:1000],
                }

            try:
                response_data = resp.json()
            except (ValueError, UnicodeDecodeError):
                return {"result": resp.text[:2000]}

            if response_path:
                return {
                    "result": _extract_jsonpath(
                        response_data, response_path
                    )
                }
            return {"result": response_data}

        except httpx.HTTPError as exc:
            logger.exception(
                "Outbound connector call failed: %s %s", method, url
            )
            return {"error": True, "message": str(exc)}


def _build_auth_headers(
    spec: dict,
    tool_def: dict,
    credentials: dict[str, str],
) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    auth_mode = tool_def.get("auth_mode", "")

    auth_config = spec.get("auth", {})
    modes = auth_config.get("modes", [])

    target_mode = next(
        (m for m in modes if m.get("type") == auth_mode), None
    )

    if target_mode and target_mode.get("type") == "bot_token":
        token = credentials.get("bot_token", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
    elif target_mode and target_mode.get("type") == "personal_token":
        token = credentials.get("api_key", credentials.get("token", ""))
        if token:
            headers["Authorization"] = f"Bearer {token}"
    else:
        for key in ("access_token", "api_key", "token", "bot_token"):
            token = credentials.get(key, "")
            if token:
                headers["Authorization"] = f"Bearer {token}"
                break

    return headers


def _apply_request_mapping(
    mapping: dict | None, params: dict
) -> dict:
    if not mapping:
        return params

    body_mapping = mapping.get("body", {})
    if not body_mapping:
        return params

    result: dict = {}
    for target_key, source_path in body_mapping.items():
        if isinstance(source_path, str) and source_path.startswith(
            "$.input."
        ):
            param_key = source_path[len("$.input."):]
            if param_key in params:
                result[target_key] = params[param_key]
        elif isinstance(source_path, (str, int, float, bool, list)):
            result[target_key] = source_path

    return result


def _extract_jsonpath(data: dict, path: str) -> str | dict | list:
    if not path.startswith("$."):
        return data

    keys = path[2:].split(".")
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key, current)
        else:
            break
    return current


KNOWN_SMTP_PROVIDERS: dict[str, tuple[str, int]] = {
    "gmail.com": ("smtp.gmail.com", 587),
    "googlemail.com": ("smtp.gmail.com", 587),
    "outlook.com": ("smtp.office365.com", 587),
    "hotmail.com": ("smtp.office365.com", 587),
    "live.com": ("smtp.office365.com", 587),
    "yahoo.com": ("smtp.mail.yahoo.com", 587),
    "yahoo.fr": ("smtp.mail.yahoo.com", 587),
    "aol.com": ("smtp.aol.com", 587),
    "icloud.com": ("smtp.mail.me.com", 587),
    "me.com": ("smtp.mail.me.com", 587),
    "mac.com": ("smtp.mail.me.com", 587),
    "zoho.com": ("smtp.zoho.com", 587),
    "protonmail.com": ("smtp.protonmail.ch", 587),
    "proton.me": ("smtp.protonmail.ch", 587),
    "gmx.com": ("mail.gmx.com", 587),
    "gmx.fr": ("mail.gmx.com", 587),
    "free.fr": ("smtp.free.fr", 587),
    "orange.fr": ("smtp.orange.fr", 587),
    "sfr.fr": ("smtp.sfr.fr", 587),
    "laposte.net": ("smtp.laposte.net", 587),
}


def _resolve_smtp_settings(
    email_address: str, credentials: dict[str, str]
) -> tuple[str, int]:
    """Resolve SMTP host and port from explicit config or domain auto-detection."""
    explicit_host = credentials.get("smtp_host", "")
    explicit_port = credentials.get("smtp_port", "")

    if explicit_host:
        port = int(explicit_port) if explicit_port else 587
        return explicit_host, port

    domain = email_address.rsplit("@", 1)[-1].lower()
    known = KNOWN_SMTP_PROVIDERS.get(domain)
    if known:
        return known

    return f"smtp.{domain}", 587


async def _send_smtp_email(
    tool_def: dict,
    params: dict,
    credentials: dict[str, str],
    connector_id: str,
) -> dict:
    """Send email via SMTP — works with any provider."""
    import asyncio
    import smtplib
    from email.mime.text import MIMEText

    email_address = credentials.get("email_address", "")
    password = credentials.get("api_key", "")

    if not email_address or not password:
        return {
            "error": True,
            "message": (
                "Missing email_address or password in credentials"
            ),
        }

    smtp_host, smtp_port = _resolve_smtp_settings(
        email_address, credentials
    )

    to_addr = params.get("to", "")
    subject = params.get("subject", "")
    body = params.get("body", "")
    cc_raw = params.get("cc", "")

    if not to_addr:
        return {"error": True, "message": "Missing 'to' parameter"}

    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = email_address
    msg["To"] = to_addr
    msg["Subject"] = subject
    if cc_raw:
        msg["Cc"] = cc_raw

    all_recipients = [to_addr]
    if cc_raw:
        all_recipients.extend(
            addr.strip() for addr in cc_raw.split(",") if addr.strip()
        )

    logger.info(
        "SMTP send: %s → %s via %s:%d (connector=%s)",
        email_address,
        to_addr,
        smtp_host,
        smtp_port,
        connector_id[:8],
    )

    def _blocking_send() -> None:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            if smtp_port in (587, 25):
                server.starttls()
                server.ehlo()
            server.login(email_address, password)
            server.sendmail(email_address, all_recipients, msg.as_string())

    try:
        await asyncio.to_thread(_blocking_send)
        return {
            "result": f"Email sent to {to_addr}",
            "from": email_address,
            "smtp_host": smtp_host,
        }
    except smtplib.SMTPAuthenticationError:
        logger.exception("SMTP auth failed for %s", email_address)
        return {
            "error": True,
            "message": (
                "Authentication failed. Check your password. "
                "For Gmail, use an App Password "
                "(Google Account > Security > App Passwords). "
                "For Outlook/Hotmail, you may need to enable "
                "SMTP access in account settings."
            ),
        }
    except smtplib.SMTPException as exc:
        logger.exception("SMTP send failed via %s", smtp_host)
        return {"error": True, "message": str(exc)}
