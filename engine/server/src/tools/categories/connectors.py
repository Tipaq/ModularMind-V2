"""Connector tool category — executes outbound connector actions.

Tool name format: connector__<connector_type>__<action_name>
Example: connector__gmail__send_email
"""

import json
import logging
import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.credentials import CredentialService
from src.connectors.models import Connector
from src.connectors.outbound import OutboundConnectorExecutor
from src.projects.models import ProjectMember

logger = logging.getLogger(__name__)

CONNECTOR_PREFIX = "connector__"


def _parse_tool_name(name: str) -> tuple[str, str]:
    """Parse connector__<type>__<action> into (type_slug, action_name)."""
    without_prefix = name.removeprefix(CONNECTOR_PREFIX)
    parts = without_prefix.split("__", 1)
    if len(parts) != 2:
        raise ValueError(
            f"Invalid connector tool name: {name}"
        )
    return parts[0], parts[1]


async def _find_connector(
    session: AsyncSession,
    type_slug: str,
    user_id: str,
) -> Connector | None:
    """Find a matching connector visible to this user."""
    project_ids_result = await session.execute(
        select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
    )
    project_ids = [r[0] for r in project_ids_result.all()]

    conditions = [
        Connector.user_id == user_id,
        Connector.user_id.is_(None) & Connector.project_id.is_(None),
    ]
    if project_ids:
        conditions.append(Connector.project_id.in_(project_ids))

    slug_pattern = re.sub(r"[^a-z0-9_]", "_", type_slug.lower())

    result = await session.execute(
        select(Connector).where(
            or_(*conditions),
            Connector.is_enabled.is_(True),
            Connector.spec.isnot(None),
        )
    )
    connectors = list(result.scalars().all())

    for connector in connectors:
        connector_slug = re.sub(
            r"[^a-z0-9_]", "_", connector.connector_type.lower()
        )
        if connector_slug == slug_pattern:
            return connector

    return None


async def execute_connector_tool(
    name: str,
    args: dict,
    user_id: str,
    session: AsyncSession,
) -> str:
    """Execute a connector outbound tool call.

    Resolves the connector and credentials, then delegates
    to OutboundConnectorExecutor.
    """
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
