"""Connectors module — webhook-based integrations with platform adapters."""

from .adapters.discord import DiscordAdapter
from .adapters.email import EmailAdapter
from .adapters.slack import SlackAdapter
from .adapters.teams import TeamsAdapter
from .adapters.telegram import TelegramAdapter
from .adapters.whatsapp import WhatsAppAdapter
from .models import Connector, ConnectorType
from .registry import register_adapter
from .router import router
from .webhook_router import webhook_router

register_adapter("discord", DiscordAdapter())
register_adapter("slack", SlackAdapter())
register_adapter("teams", TeamsAdapter())
register_adapter("email", EmailAdapter())
register_adapter("telegram", TelegramAdapter())
register_adapter("whatsapp", WhatsAppAdapter())

__all__ = [
    "Connector",
    "ConnectorType",
    "router",
    "webhook_router",
]
