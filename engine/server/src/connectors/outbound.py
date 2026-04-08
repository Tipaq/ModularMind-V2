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


async def _send_smtp_email(
    tool_def: dict,
    params: dict,
    credentials: dict[str, str],
    connector_id: str,
) -> dict:
    """Send email via SMTP (Gmail App Password, etc.)."""
    import asyncio
    import smtplib
    from email.mime.text import MIMEText

    smtp_address = tool_def.get("path", "smtp.gmail.com:587")
    host_port = smtp_address.split(":")
    host = host_port[0]
    port = int(host_port[1]) if len(host_port) > 1 else 587

    email_address = credentials.get("email_address", "")
    app_password = credentials.get("api_key", "")

    if not email_address or not app_password:
        return {
            "error": True,
            "message": "Missing email_address or api_key (app password)",
        }

    to_addr = params.get("to", "")
    subject = params.get("subject", "")
    body = params.get("body", "")

    if not to_addr:
        return {"error": True, "message": "Missing 'to' parameter"}

    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = email_address
    msg["To"] = to_addr
    msg["Subject"] = subject

    logger.info(
        "SMTP send: %s → %s (connector=%s)",
        email_address,
        to_addr,
        connector_id[:8],
    )

    def _blocking_send() -> None:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(email_address, app_password)
            server.send_message(msg)

    try:
        await asyncio.to_thread(_blocking_send)
        return {"result": f"Email sent to {to_addr}"}
    except smtplib.SMTPException as exc:
        logger.exception("SMTP send failed")
        return {"error": True, "message": str(exc)}
