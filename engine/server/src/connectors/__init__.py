"""Connectors module - Webhook-based integrations (Slack, Teams, Email)."""

from .models import Connector, ConnectorType
from .router import router
from .webhook_router import webhook_router

__all__ = [
    "Connector",
    "ConnectorType",
    "router",
    "webhook_router",
]
