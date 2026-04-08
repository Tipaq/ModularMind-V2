"""OAuth provider configurations for connector authentication.

Admin stores client_id and client_secret in SecretsStore via
the Configuration > OAuth Providers UI. Users then do the OAuth
flow to connect their accounts.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.infra.secrets import get_secrets_store


@dataclass
class OAuthProviderConfig:
    provider_id: str
    name: str
    auth_url: str
    token_url: str
    scopes: list[str]
    client_id_key: str
    client_secret_key: str
    extra_auth_params: dict[str, str]


OAUTH_PROVIDERS: dict[str, OAuthProviderConfig] = {
    "google": OAuthProviderConfig(
        provider_id="google",
        name="Google (Gmail)",
        auth_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        scopes=["https://mail.google.com/"],
        client_id_key="OAUTH_GOOGLE_CLIENT_ID",
        client_secret_key="OAUTH_GOOGLE_CLIENT_SECRET",
        extra_auth_params={"access_type": "offline", "prompt": "consent"},
    ),
    "microsoft": OAuthProviderConfig(
        provider_id="microsoft",
        name="Microsoft (Outlook)",
        auth_url=(
            "https://login.microsoftonline.com/common"
            "/oauth2/v2.0/authorize"
        ),
        token_url=(
            "https://login.microsoftonline.com/common"
            "/oauth2/v2.0/token"
        ),
        scopes=[
            "https://graph.microsoft.com/Mail.Send",
            "https://graph.microsoft.com/User.Read",
            "offline_access",
        ],
        client_id_key="OAUTH_MICROSOFT_CLIENT_ID",
        client_secret_key="OAUTH_MICROSOFT_CLIENT_SECRET",
        extra_auth_params={},
    ),
}


def get_oauth_provider(provider_id: str) -> OAuthProviderConfig | None:
    return OAUTH_PROVIDERS.get(provider_id)


def get_oauth_client_credentials(
    provider: OAuthProviderConfig,
) -> tuple[str, str] | None:
    """Load client_id and client_secret from SecretsStore."""
    store = get_secrets_store()
    client_id = store.get(provider.client_id_key, "")
    client_secret = store.get(provider.client_secret_key, "")
    if not client_id or not client_secret:
        return None
    return client_id, client_secret


def list_configured_providers() -> list[dict]:
    """Return OAuth providers with their configuration status."""
    store = get_secrets_store()
    result = []
    for provider in OAUTH_PROVIDERS.values():
        has_credentials = bool(
            store.get(provider.client_id_key)
            and store.get(provider.client_secret_key)
        )
        result.append({
            "provider_id": provider.provider_id,
            "name": provider.name,
            "configured": has_credentials,
        })
    return result
