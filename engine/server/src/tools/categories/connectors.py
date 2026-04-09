"""Connector tool category — executes outbound connector actions.

Tool name format: connector__<connector_type>__<action_name>
Example: connector__google_email__send_email
"""

import json
import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.credentials import CredentialService
from src.connectors.outbound import OutboundConnectorExecutor

logger = logging.getLogger(__name__)

CONNECTOR_PREFIX = "connector__"


@dataclass
class ConnectorRow:
    id: str
    name: str
    connector_type: str
    spec: dict = field(default_factory=dict)
    config: dict = field(default_factory=dict)


def _parse_tool_name(name: str) -> tuple[str, str]:
    """Parse connector__<type>__<action> into (type_slug, action_name)."""
    without_prefix = name.removeprefix(CONNECTOR_PREFIX)
    parts = without_prefix.split("__", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid connector tool name: {name}")
    return parts[0], parts[1]


async def _find_connector(
    session: AsyncSession,
    type_slug: str,
    user_id: str,
) -> ConnectorRow | None:
    """Find a matching connector visible to this user (raw SQL)."""
    project_result = await session.execute(
        text(
            "SELECT project_id FROM project_members "
            "WHERE user_id = :user_id"
        ),
        {"user_id": user_id},
    )
    project_ids = [r[0] for r in project_result.fetchall()]

    if project_ids:
        query = text(
            "SELECT id, name, connector_type, spec, config "
            "FROM connectors "
            "WHERE is_enabled = true AND spec IS NOT NULL AND ("
            "  user_id = :user_id "
            "  OR (user_id IS NULL AND project_id IS NULL) "
            "  OR project_id = ANY(:project_ids)"
            ")"
        )
        result = await session.execute(
            query,
            {"user_id": user_id, "project_ids": project_ids},
        )
    else:
        query = text(
            "SELECT id, name, connector_type, spec, config "
            "FROM connectors "
            "WHERE is_enabled = true AND spec IS NOT NULL AND ("
            "  user_id = :user_id "
            "  OR (user_id IS NULL AND project_id IS NULL)"
            ")"
        )
        result = await session.execute(
            query, {"user_id": user_id}
        )

    slug_pattern = re.sub(r"[^a-z0-9_]", "_", type_slug.lower())

    for row in result.fetchall():
        connector_slug = re.sub(
            r"[^a-z0-9_]", "_", row[2].lower()
        )
        if connector_slug == slug_pattern:
            return ConnectorRow(
                id=row[0],
                name=row[1],
                connector_type=row[2],
                spec=row[3] or {},
                config=row[4] or {},
            )

    return None


async def execute_connector_tool(
    name: str,
    args: dict,
    user_id: str,
    session: AsyncSession,
) -> str:
    """Execute a connector outbound tool call."""
    type_slug, action_name = _parse_tool_name(name)

    connector = await _find_connector(session, type_slug, user_id)
    if not connector:
        return (
            f"Error: no active connector of type '{type_slug}' "
            f"found for this user"
        )

    credential_service = CredentialService(session)
    try:
        credential = await credential_service.resolve_credential(
            connector.id, user_id
        )
        decrypted = credential_service.decrypt_token_map(credential)
    except Exception as exc:
        return f"Error: could not resolve credentials — {exc}"

    executor = OutboundConnectorExecutor()
    result = await executor.execute_action(
        connector, action_name, args, decrypted
    )

    return json.dumps(result, default=str)
