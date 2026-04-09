"""OAuth flow endpoints for connector authentication.

Flow:
1. Frontend calls GET /connectors/oauth/authorize/{provider}
2. Backend returns a redirect URL
3. User authorizes in browser → callback to GET /connectors/oauth/callback/{provider}
4. Backend exchanges code for tokens, creates connector + credential
5. Redirects user back to the settings page
"""

import json
import logging
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from src.auth import CurrentUser
from src.connectors.credentials import CredentialService
from src.connectors.models import Connector
from src.connectors.oauth_providers import (
    get_oauth_client_credentials,
    get_oauth_provider,
    list_configured_providers,
)
from src.infra.database import DbSession
from src.infra.secrets import get_secrets_store

logger = logging.getLogger(__name__)

oauth_router = APIRouter(
    prefix="/connectors/oauth", tags=["Connector OAuth"]
)


def _build_callback_url(request: Request, provider_id: str) -> str:
    """Build the OAuth callback URL using forwarded headers (reverse proxy aware)."""
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return (
        f"{proto}://{host}"
        f"/api/v1/connectors/oauth/callback/{provider_id}"
    )


def _encrypt_state(data: dict) -> str:
    store = get_secrets_store()
    return store.encrypt_value(json.dumps(data))


def _decrypt_state(encrypted: str) -> dict:
    store = get_secrets_store()
    return json.loads(store.decrypt_value(encrypted))


@oauth_router.get("/providers")
async def list_oauth_providers() -> list[dict]:
    """List available OAuth providers and their config status."""
    return list_configured_providers()


@oauth_router.get("/authorize/{provider_id}")
async def authorize(
    provider_id: str,
    user: CurrentUser,
    request: Request,
    connector_name: str = Query(default=""),
    project_id: str = Query(default=""),
) -> dict:
    """Initiate OAuth flow. Returns the authorization URL."""
    provider = get_oauth_provider(provider_id)
    if not provider:
        raise HTTPException(
            status_code=404, detail=f"Unknown provider: {provider_id}"
        )

    creds = get_oauth_client_credentials(provider)
    if not creds:
        raise HTTPException(
            status_code=422,
            detail=(
                f"OAuth not configured for {provider.name}. "
                f"Admin must set {provider.client_id_key} and "
                f"{provider.client_secret_key} in Configuration."
            ),
        )
    client_id, _ = creds

    callback_url = _build_callback_url(request, provider_id)

    state_data = {
        "user_id": user.id,
        "provider_id": provider_id,
        "connector_name": connector_name or provider.name,
        "project_id": project_id,
        "nonce": str(uuid4())[:8],
    }
    encrypted_state = _encrypt_state(state_data)

    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        "state": encrypted_state,
        **provider.extra_auth_params,
    }

    auth_url = f"{provider.auth_url}?{urlencode(params)}"
    return {"auth_url": auth_url}


@oauth_router.get("/callback/{provider_id}")
async def callback(
    provider_id: str,
    request: Request,
    db: DbSession,
    code: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    """OAuth callback — exchanges code for tokens, creates connector."""
    provider = get_oauth_provider(provider_id)
    if not provider:
        raise HTTPException(
            status_code=404, detail="Unknown provider"
        )

    creds = get_oauth_client_credentials(provider)
    if not creds:
        raise HTTPException(status_code=500, detail="OAuth not configured")
    client_id, client_secret = creds

    try:
        state_data = _decrypt_state(state)
    except Exception:
        raise HTTPException(
            status_code=400, detail="Invalid state parameter"
        ) from None

    user_id = state_data["user_id"]
    connector_name = state_data.get("connector_name", provider.name)
    project_id = state_data.get("project_id", "") or None

    callback_url = _build_callback_url(request, provider_id)

    token_data = await _exchange_code(
        provider, client_id, client_secret, code, callback_url
    )
    if "error" in token_data:
        logger.error(
            "OAuth token exchange failed for %s: %s",
            provider_id,
            token_data,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                "Token exchange failed: "
                f"{token_data.get('error_description', token_data.get('error'))}"
            ),
        )

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")

    user_email = await _fetch_user_email(provider_id, access_token)

    connector_type = _provider_connector_type(provider_id)
    spec = _provider_spec(provider_id)

    connector = Connector(
        id=str(uuid4()),
        name=connector_name,
        connector_type=connector_type,
        user_id=user_id if not project_id else None,
        project_id=project_id,
        spec=spec,
        is_enabled=True,
        config={"email_address": user_email} if user_email else {},
    )
    db.add(connector)
    await db.flush()

    credential_service = CredentialService(db)
    await credential_service.store_credential(
        connector_id=connector.id,
        credential_type="oauth2",
        label=f"{provider.name} ({user_email or 'connected'})",
        value=access_token,
        user_id=user_id,
        refresh_token=refresh_token,
        provider=provider_id,
        scopes=provider.scopes,
    )

    await db.commit()
    logger.info(
        "OAuth connector created: %s for user %s (%s)",
        connector.id[:8],
        user_id[:8],
        user_email or "unknown",
    )

    redirect_path = "/settings?tab=connections"
    if project_id:
        redirect_path = f"/projects/{project_id}/connectors"
    return RedirectResponse(url=redirect_path, status_code=302)


async def _exchange_code(
    provider, client_id: str, client_secret: str,
    code: str, redirect_uri: str,
) -> dict:
    """Exchange authorization code for tokens."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            provider.token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        return resp.json()


async def _fetch_user_email(
    provider_id: str, access_token: str
) -> str:
    """Fetch the user's email address from the OAuth provider."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if provider_id == "google":
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={
                        "Authorization": f"Bearer {access_token}"
                    },
                )
                return resp.json().get("email", "")
            if provider_id == "microsoft":
                resp = await client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers={
                        "Authorization": f"Bearer {access_token}"
                    },
                )
                data = resp.json()
                return (
                    data.get("mail")
                    or data.get("userPrincipalName", "")
                )
    except (httpx.HTTPError, KeyError, ValueError):
        logger.warning(
            "Could not fetch email for %s", provider_id
        )
    return ""


def _provider_connector_type(provider_id: str) -> str:
    return {
        "google": "google_email",
        "microsoft": "microsoft_email",
    }.get(provider_id, f"oauth_{provider_id}")


def _provider_spec(provider_id: str) -> dict:
    """Return the outbound spec for an OAuth-connected email provider."""
    if provider_id == "google":
        return {
            "base_url": "",
            "auth": {
                "modes": [{
                    "type": "oauth2",
                    "purpose": "user_identity",
                }],
            },
            "outbound": {
                "tools": [{
                    "name": "send_email",
                    "description": (
                        "Send an email from your Gmail account"
                    ),
                    "method": "SMTP_XOAUTH2",
                    "path": "smtp.gmail.com:587",
                    "auth_mode": "oauth2",
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
                            "cc": {
                                "type": "string",
                                "description": "CC (optional)",
                            },
                        },
                        "required": ["to", "subject", "body"],
                    },
                }],
            },
            "health_check": None,
        }

    if provider_id == "microsoft":
        return {
            "base_url": "https://graph.microsoft.com/v1.0",
            "auth": {
                "modes": [{
                    "type": "oauth2",
                    "purpose": "user_identity",
                }],
            },
            "outbound": {
                "tools": [{
                    "name": "send_email",
                    "description": (
                        "Send an email from your Outlook account"
                    ),
                    "method": "GRAPH_SEND_MAIL",
                    "path": "/me/sendMail",
                    "auth_mode": "oauth2",
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
                            "cc": {
                                "type": "string",
                                "description": "CC (optional)",
                            },
                        },
                        "required": ["to", "subject", "body"],
                    },
                }],
            },
            "health_check": None,
        }

    return {}
