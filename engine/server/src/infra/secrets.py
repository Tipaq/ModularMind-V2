"""SecretsStore — Fernet-encrypted persistence + in-memory cache for API keys.

Never synced to platform. Loaded on startup from .secrets.enc + env var fallback.
"""

# TODO: Migrate from V1 runtime/server/src/infra/secrets.py
