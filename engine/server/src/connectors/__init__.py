"""Connectors module — webhook-based integrations with platform adapters."""

from .adapters.discord import DiscordAdapter
from .adapters.slack import SlackAdapter
from .adapters.teams import TeamsAdapter
from .adapters.telegram import TelegramAdapter
from .adapters.whatsapp import WhatsAppAdapter
from .models import Connector, ConnectorCredential
from .registry import register_adapter
from .router import project_connector_router, router
from .webhook_router import webhook_router

register_adapter("discord", DiscordAdapter())
register_adapter("slack", SlackAdapter())
register_adapter("teams", TeamsAdapter())
register_adapter("telegram", TelegramAdapter())
register_adapter("whatsapp", WhatsAppAdapter())

__all__ = [
    "Connector",
    "ConnectorCredential",
    "project_connector_router",
    "router",
    "webhook_router",
]
