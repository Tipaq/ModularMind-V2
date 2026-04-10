"""Outbound connector executor — executes tool calls defined in Connector.spec."""

import ipaddress
import logging
from typing import Protocol
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


class ConnectorLike(Protocol):
    id: str
    spec: dict | None
    config: dict

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

    def list_actions(self, connector: ConnectorLike) -> list[dict]:
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
        connector: ConnectorLike,
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

        if method == "SMTP_XOAUTH2":
            return await _send_smtp_xoauth2(
                tool_def, params, decrypted_credentials,
                connector.config or {}, connector.id,
            )

        if method == "GRAPH_SEND_MAIL":
            return await _send_graph_email(
                tool_def, params, decrypted_credentials,
                spec.get("base_url", ""), connector.id,
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


async def test_connector_credentials(
    spec: dict, credentials: dict[str, str]
) -> dict:
    """Test connector credentials before saving.

    Returns {"success": True, "message": "..."} or
    {"success": False, "message": "error details"}.
    """
    outbound = spec.get("outbound", {})
    tools = outbound.get("tools", [])

    has_smtp = any(t.get("method") == "SMTP" for t in tools)
    if has_smtp:
        return await _test_smtp_credentials(credentials)

    health = spec.get("health_check")
    base_url = spec.get("base_url", "")
    if health and base_url:
        return await _test_http_health(
            spec, base_url, health, credentials
        )

    if base_url and tools:
        return {"success": True, "message": "Credentials saved (no health check available)"}

    return {"success": True, "message": "Connector configured"}


async def _test_smtp_credentials(
    credentials: dict[str, str],
) -> dict:
    """Test SMTP login without sending any email."""
    import asyncio
    import smtplib

    email_address = credentials.get("email_address", "")
    password = credentials.get("api_key", "")

    if not email_address:
        return {"success": False, "message": "Email address is required"}
    if not password:
        return {"success": False, "message": "Password is required"}

    smtp_host, smtp_port = _resolve_smtp_settings(
        email_address, credentials
    )

    def _blocking_test() -> str:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            if smtp_port in (587, 25):
                server.starttls()
                server.ehlo()
            server.login(email_address, password)
            server.noop()
        return f"Connected to {smtp_host}:{smtp_port}"

    try:
        detail = await asyncio.to_thread(_blocking_test)
        return {"success": True, "message": detail}
    except smtplib.SMTPAuthenticationError:
        hint = _auth_error_hint(email_address, smtp_host)
        return {"success": False, "message": hint}
    except smtplib.SMTPConnectError:
        return {
            "success": False,
            "message": (
                f"Could not connect to {smtp_host}:{smtp_port}. "
                f"Check that the SMTP host is correct."
            ),
        }
    except (TimeoutError, OSError) as exc:
        return {
            "success": False,
            "message": (
                f"Connection to {smtp_host}:{smtp_port} timed out "
                f"or was refused: {exc}"
            ),
        }
    except smtplib.SMTPException as exc:
        return {"success": False, "message": str(exc)}


async def _test_http_health(
    spec: dict,
    base_url: str,
    health: dict,
    credentials: dict[str, str],
) -> dict:
    """Test HTTP health check endpoint."""
    method = health.get("method", "GET")
    path = health.get("path", "/")
    expected = health.get("expected_status", 200)

    url = f"{base_url.rstrip('/')}{path}"
    if _is_blocked_url(url):
        return {"success": False, "message": f"Blocked URL: {url}"}

    headers = _build_auth_headers(spec, {"auth_mode": ""}, credentials)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.request(method, url, headers=headers)
            if resp.status_code == expected:
                return {
                    "success": True,
                    "message": f"Health check passed ({resp.status_code})",
                }
            return {
                "success": False,
                "message": (
                    f"Health check returned {resp.status_code}, "
                    f"expected {expected}"
                ),
            }
    except httpx.HTTPError as exc:
        return {"success": False, "message": f"Request failed: {exc}"}


def _auth_error_hint(email_address: str, smtp_host: str) -> str:
    """Return a provider-specific authentication error message."""
    domain = email_address.rsplit("@", 1)[-1].lower()

    if domain in ("gmail.com", "googlemail.com"):
        return (
            "Gmail authentication failed. "
            "Gmail requires an App Password (not your regular password). "
            "Go to Google Account > Security > 2-Step Verification > "
            "App Passwords, generate one, and use it here."
        )

    if domain in ("outlook.com", "hotmail.com", "live.com"):
        return (
            "Outlook/Hotmail authentication failed. "
            "Microsoft has deprecated Basic Auth for SMTP "
            "(fully disabled April 2026). SMTP with password "
            "no longer works for Outlook/Hotmail accounts. "
            "Use the SendGrid connector instead, or a different "
            "email provider (Gmail with App Password still works)."
        )

    if domain in ("yahoo.com", "yahoo.fr"):
        return (
            "Yahoo authentication failed. "
            "Yahoo requires an App Password. Go to Yahoo Account > "
            "Security > Generate app password and use it here."
        )

    if domain in ("icloud.com", "me.com", "mac.com"):
        return (
            "iCloud authentication failed. "
            "Apple requires an App-Specific Password. Go to "
            "appleid.apple.com > Sign-In and Security > "
            "App-Specific Passwords."
        )

    return (
        f"Authentication failed for {email_address} "
        f"via {smtp_host}. Check your email and password. "
        f"If your provider requires 2FA, you may need an "
        f"app-specific password."
    )


KNOWN_SMTP_PROVIDERS: dict[str, tuple[str, int]] = {
    "gmail.com": ("smtp.gmail.com", 587),
    "googlemail.com": ("smtp.gmail.com", 587),
    "outlook.com": ("smtp-mail.outlook.com", 587),
    "hotmail.com": ("smtp-mail.outlook.com", 587),
    "live.com": ("smtp-mail.outlook.com", 587),
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
            "message": _auth_error_hint(email_address, smtp_host),
        }
    except smtplib.SMTPException as exc:
        logger.exception("SMTP send failed via %s", smtp_host)
        return {"error": True, "message": str(exc)}


async def _send_smtp_xoauth2(
    tool_def: dict,
    params: dict,
    credentials: dict[str, str],
    connector_config: dict,
    connector_id: str,
) -> dict:
    """Send email via Gmail SMTP with XOAUTH2 (OAuth access token)."""
    import asyncio
    import base64
    import smtplib
    from email.mime.text import MIMEText

    access_token = credentials.get("token", "")
    email_address = connector_config.get("email_address", "")

    if not email_address and access_token:
        email_address = await _fetch_email_from_google(access_token)

    if not access_token or not email_address:
        return {
            "error": True,
            "message": "Missing OAuth token or email address",
        }

    smtp_address = tool_def.get("path", "smtp.gmail.com:587")
    host_port = smtp_address.split(":")
    smtp_host = host_port[0]
    smtp_port = int(host_port[1]) if len(host_port) > 1 else 587

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
            a.strip() for a in cc_raw.split(",") if a.strip()
        )

    xoauth2_string = (
        f"user={email_address}\x01"
        f"auth=Bearer {access_token}\x01\x01"
    )
    xoauth2_b64 = base64.b64encode(
        xoauth2_string.encode()
    ).decode()

    logger.info(
        "XOAUTH2 send: %s -> %s (connector=%s)",
        email_address,
        to_addr,
        connector_id[:8],
    )

    def _blocking_send() -> None:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            code, resp = server.docmd("AUTH", f"XOAUTH2 {xoauth2_b64}")
            if code != 235:
                raise smtplib.SMTPAuthenticationError(
                    code, resp
                )
            server.sendmail(
                email_address, all_recipients, msg.as_string()
            )

    try:
        await asyncio.to_thread(_blocking_send)
        return {"result": f"Email sent to {to_addr}"}
    except smtplib.SMTPAuthenticationError:
        logger.exception("XOAUTH2 auth failed for %s", email_address)
        return {
            "error": True,
            "message": (
                "Gmail OAuth authentication failed. "
                "Your token may have expired — "
                "reconnect your Gmail in Settings > Connections."
            ),
        }
    except smtplib.SMTPException as exc:
        logger.exception("XOAUTH2 send failed")
        return {"error": True, "message": str(exc)}


async def _send_graph_email(
    tool_def: dict,
    params: dict,
    credentials: dict[str, str],
    base_url: str,
    connector_id: str,
) -> dict:
    """Send email via Microsoft Graph API."""
    access_token = credentials.get("token", "")
    if not access_token:
        return {
            "error": True,
            "message": "Missing OAuth token",
        }

    to_addr = params.get("to", "")
    subject = params.get("subject", "")
    body = params.get("body", "")
    cc_raw = params.get("cc", "")

    if not to_addr:
        return {"error": True, "message": "Missing 'to' parameter"}

    to_recipients = [
        {"emailAddress": {"address": to_addr}}
    ]
    cc_recipients = []
    if cc_raw:
        cc_recipients = [
            {"emailAddress": {"address": a.strip()}}
            for a in cc_raw.split(",")
            if a.strip()
        ]

    graph_payload = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "Text",
                "content": body,
            },
            "toRecipients": to_recipients,
            "ccRecipients": cc_recipients,
        },
    }

    url = f"{base_url.rstrip('/')}/me/sendMail"
    logger.info(
        "Graph sendMail -> %s (connector=%s)",
        to_addr,
        connector_id[:8],
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=graph_payload,
            )

        if resp.status_code == 202:
            return {"result": f"Email sent to {to_addr}"}
        if resp.status_code == 401:
            return {
                "error": True,
                "message": (
                    "Microsoft OAuth token expired or invalid. "
                    "Reconnect your Outlook in "
                    "Settings > Connections."
                ),
            }
        return {
            "error": True,
            "status": resp.status_code,
            "message": resp.text[:500],
        }
    except httpx.HTTPError as exc:
        logger.exception("Graph sendMail failed")
        return {"error": True, "message": str(exc)}


async def _fetch_email_from_google(access_token: str) -> str:
    """Fetch user email from Google userinfo API using OAuth token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                return resp.json().get("email", "")
    except (httpx.HTTPError, KeyError, ValueError):
        logger.debug("Could not fetch Google email from userinfo")
    return ""
