"""Pre-built connector spec catalog.

Template specs for common services. Users instantiate these
as connectors by providing their credentials.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CatalogEntry:
    type_id: str
    name: str
    description: str
    icon: str
    color: str
    category: str
    spec: dict


SMTP_SEND_EMAIL_TOOL = {
    "name": "send_email",
    "description": "Send an email from your connected account",
    "method": "SMTP",
    "path": "auto",
    "auth_mode": "personal_token",
    "input_schema": {
        "type": "object",
        "properties": {
            "to": {
                "type": "string",
                "description": "Recipient email address",
            },
            "subject": {
                "type": "string",
                "description": "Email subject line",
            },
            "body": {
                "type": "string",
                "description": "Email body (plain text)",
            },
            "cc": {
                "type": "string",
                "description": "CC recipients (comma-separated, optional)",
            },
        },
        "required": ["to", "subject", "body"],
    },
}


CATALOG: list[CatalogEntry] = [
    CatalogEntry(
        type_id="email",
        name="Email",
        description=(
            "Send emails from any email account — Gmail, Outlook, "
            "Yahoo, corporate email, or any SMTP provider. "
            "SMTP settings are auto-detected for common providers."
        ),
        icon="mail",
        color="bg-destructive",
        category="communication",
        spec={
            "base_url": "",
            "auth": {
                "modes": [
                    {
                        "type": "personal_token",
                        "fields": [
                            {
                                "key": "email_address",
                                "label": "Email Address",
                                "is_secret": False,
                                "placeholder": "you@example.com",
                            },
                            {
                                "key": "api_key",
                                "label": "Password / App Password",
                                "is_secret": True,
                                "placeholder": (
                                    "Your email password or app-specific password"
                                ),
                            },
                            {
                                "key": "smtp_host",
                                "label": "SMTP Host (auto-detected if empty)",
                                "is_secret": False,
                                "is_required": False,
                                "placeholder": "smtp.example.com",
                            },
                            {
                                "key": "smtp_port",
                                "label": "SMTP Port (auto-detected if empty)",
                                "is_secret": False,
                                "is_required": False,
                                "placeholder": "587",
                            },
                        ],
                        "purpose": "user_identity",
                    },
                ],
            },
            "outbound": {"tools": [SMTP_SEND_EMAIL_TOOL]},
            "health_check": None,
        },
    ),
    CatalogEntry(
        type_id="sendgrid",
        name="SendGrid",
        description="Send emails via SendGrid API",
        icon="mail",
        color="bg-info",
        category="communication",
        spec={
            "base_url": "https://api.sendgrid.com/v3",
            "auth": {
                "modes": [
                    {
                        "type": "api_key",
                        "fields": [
                            {
                                "key": "api_key",
                                "label": "SendGrid API Key",
                                "is_secret": True,
                                "placeholder": "SG.xxxx",
                            },
                            {
                                "key": "from_email",
                                "label": "From Email",
                                "is_secret": False,
                                "placeholder": "you@domain.com",
                            },
                        ],
                        "purpose": "service",
                    },
                ],
            },
            "outbound": {
                "tools": [
                    {
                        "name": "send_email",
                        "description": "Send an email via SendGrid",
                        "method": "POST",
                        "path": "/mail/send",
                        "auth_mode": "api_key",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "to": {
                                    "type": "string",
                                    "description": "Recipient email",
                                },
                                "subject": {
                                    "type": "string",
                                    "description": "Email subject",
                                },
                                "body": {
                                    "type": "string",
                                    "description": "Email body",
                                },
                            },
                            "required": ["to", "subject", "body"],
                        },
                        "request_mapping": {
                            "body": {
                                "personalizations": [
                                    {
                                        "to": [
                                            {"email": "$.input.to"}
                                        ],
                                    },
                                ],
                                "from": {
                                    "email": "$.config.from_email"
                                },
                                "subject": "$.input.subject",
                                "content": [
                                    {
                                        "type": "text/plain",
                                        "value": "$.input.body",
                                    },
                                ],
                            },
                        },
                        "response_path": "$.status",
                    },
                ],
            },
            "health_check": {
                "method": "GET",
                "path": "/user/profile",
                "expected_status": 200,
            },
        },
    ),
    CatalogEntry(
        type_id="webhook_outbound",
        name="Webhook (Outbound)",
        description="Send data to any HTTP endpoint via webhook",
        icon="plug",
        color="bg-secondary",
        category="utility",
        spec={
            "base_url": "",
            "auth": {
                "modes": [
                    {
                        "type": "api_key",
                        "fields": [
                            {
                                "key": "api_key",
                                "label": "Auth Token (optional)",
                                "is_secret": True,
                                "is_required": False,
                                "placeholder": "Bearer token or API key",
                            },
                            {
                                "key": "webhook_url",
                                "label": "Webhook URL",
                                "is_secret": False,
                                "placeholder": "https://...",
                            },
                        ],
                        "purpose": "service",
                    },
                ],
            },
            "outbound": {
                "tools": [
                    {
                        "name": "send_webhook",
                        "description": (
                            "Send a JSON payload to a webhook URL"
                        ),
                        "method": "POST",
                        "path": "",
                        "auth_mode": "api_key",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "data": {
                                    "type": "object",
                                    "description": "JSON data to send",
                                },
                            },
                            "required": ["data"],
                        },
                        "request_mapping": {
                            "body": {"payload": "$.input.data"},
                        },
                    },
                ],
            },
            "health_check": None,
        },
    ),
    CatalogEntry(
        type_id="notion",
        name="Notion",
        description="Create and search Notion pages and databases",
        icon="plug",
        color="bg-primary",
        category="productivity",
        spec={
            "base_url": "https://api.notion.com/v1",
            "auth": {
                "modes": [
                    {
                        "type": "api_key",
                        "fields": [
                            {
                                "key": "api_key",
                                "label": "Notion Integration Token",
                                "is_secret": True,
                                "placeholder": "ntn_xxxx",
                            },
                        ],
                        "purpose": "user_identity",
                    },
                ],
            },
            "outbound": {
                "tools": [
                    {
                        "name": "search",
                        "description": (
                            "Search Notion pages and databases"
                        ),
                        "method": "POST",
                        "path": "/search",
                        "auth_mode": "api_key",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "Search query",
                                },
                            },
                            "required": ["query"],
                        },
                        "request_mapping": {
                            "body": {"query": "$.input.query"},
                        },
                        "response_path": "$.results",
                    },
                    {
                        "name": "create_page",
                        "description": (
                            "Create a new page in a Notion database"
                        ),
                        "method": "POST",
                        "path": "/pages",
                        "auth_mode": "api_key",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "database_id": {
                                    "type": "string",
                                    "description": "Target database ID",
                                },
                                "title": {
                                    "type": "string",
                                    "description": "Page title",
                                },
                                "content": {
                                    "type": "string",
                                    "description": "Page content",
                                },
                            },
                            "required": ["database_id", "title"],
                        },
                    },
                ],
            },
            "health_check": {
                "method": "GET",
                "path": "/users/me",
                "expected_status": 200,
            },
        },
    ),
    CatalogEntry(
        type_id="linear",
        name="Linear",
        description="Create and manage Linear issues",
        icon="plug",
        color="bg-accent",
        category="project_management",
        spec={
            "base_url": "https://api.linear.app",
            "auth": {
                "modes": [
                    {
                        "type": "api_key",
                        "fields": [
                            {
                                "key": "api_key",
                                "label": "Linear API Key",
                                "is_secret": True,
                                "placeholder": "lin_api_xxxx",
                            },
                        ],
                        "purpose": "user_identity",
                    },
                ],
            },
            "outbound": {
                "tools": [
                    {
                        "name": "create_issue",
                        "description": "Create a new Linear issue",
                        "method": "POST",
                        "path": "/graphql",
                        "auth_mode": "api_key",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "Issue title",
                                },
                                "description": {
                                    "type": "string",
                                    "description": (
                                        "Issue description (markdown)"
                                    ),
                                },
                                "team_id": {
                                    "type": "string",
                                    "description": "Linear team ID",
                                },
                            },
                            "required": ["title", "team_id"],
                        },
                    },
                ],
            },
            "health_check": None,
        },
    ),
]


def get_catalog() -> list[CatalogEntry]:
    return CATALOG


def get_catalog_entry(type_id: str) -> CatalogEntry | None:
    return next(
        (e for e in CATALOG if e.type_id == type_id), None
    )
