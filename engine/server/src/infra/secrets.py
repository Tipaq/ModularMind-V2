"""
Local secrets management for the client runtime.

Security model:
- API keys are entered by the user in the runtime dashboard
- Stored encrypted on disk using Fernet (AES-128-CBC + HMAC)
- Loaded into memory on startup for fast access
- Never sent to the platform

Usage:
    from src.infra.secrets import secrets_store

    # Get a secret
    api_key = secrets_store.get("OPENAI_API_KEY")

    # Check if secret exists
    if secrets_store.has("ANTHROPIC_API_KEY"):
        ...

    # Set a secret (persists encrypted to disk)
    secrets_store.set("OPENAI_API_KEY", "sk-...")
"""

import base64
import hashlib
import json
import logging
import os
import platform
import stat
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Provider name -> environment variable key mapping
PROVIDER_KEY_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "cohere": "COHERE_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "groq": "GROQ_API_KEY",
}


def derive_fernet_key(secret_key: str) -> bytes:
    """Derive a Fernet-compatible key from the application SECRET_KEY."""
    key_bytes = hashlib.sha256(secret_key.encode()).digest()
    return base64.urlsafe_b64encode(key_bytes)


class SecretsStore:
    """
    Local encrypted secrets store.

    Thread-safe storage for API keys with encrypted persistence.
    Keys are stored encrypted on disk and loaded into memory on startup.
    """

    def __init__(self):
        self._secrets: dict[str, str] = {}
        self._lock = Lock()
        self._last_update: datetime | None = None
        self._fernet: Fernet | None = None
        self._storage_path: Path | None = None

    def initialize(self, secret_key: str, storage_dir: str) -> None:
        """
        Initialize the store with encryption key and storage path.

        Called once at application startup.

        Args:
            secret_key: Application SECRET_KEY for encryption
            storage_dir: Directory for storing the encrypted secrets file
        """
        self._fernet = Fernet(derive_fernet_key(secret_key))
        self._storage_path = Path(storage_dir) / ".secrets.enc"
        self.load_from_disk()
        self.load_from_env()

    def load_from_disk(self) -> None:
        """Load encrypted secrets from disk."""
        if not self._storage_path or not self._storage_path.exists():
            return

        try:
            encrypted_data = self._storage_path.read_bytes()
            decrypted = self._fernet.decrypt(encrypted_data)
            data = json.loads(decrypted.decode())

            with self._lock:
                self._secrets = data.get("secrets", {})
                ts = data.get("updated_at")
                self._last_update = datetime.fromisoformat(ts) if ts else None

            logger.info("Loaded %d secrets from encrypted storage", len(self._secrets))
        except InvalidToken:
            logger.error(
                "Failed to decrypt secrets file - SECRET_KEY may have changed. "
                "API keys will need to be re-entered in the dashboard."
            )
        except (OSError, json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("Error loading secrets from disk: %s", e)

    def load_from_env(self) -> None:
        """Load API keys from environment variables as fallback."""
        for provider, env_key in PROVIDER_KEY_MAP.items():
            env_value = os.environ.get(env_key)
            if env_value and not self.has(env_key):
                with self._lock:
                    self._secrets[env_key] = env_value
                logger.info("Loaded %s from environment variable", env_key)

    def persist(self) -> None:
        """Persist encrypted secrets to disk. Must be called within self._lock.

        Uses atomic write (temp file + rename) to prevent corruption
        if the process crashes mid-write.
        """
        if not self._fernet or not self._storage_path:
            logger.warning("SecretsStore not initialized, cannot persist")
            return

        try:
            data = {
                "secrets": self._secrets,
                "updated_at": datetime.now(UTC).isoformat(),
            }
            plaintext = json.dumps(data).encode()
            encrypted = self._fernet.encrypt(plaintext)

            self._storage_path.parent.mkdir(parents=True, exist_ok=True)

            # Atomic write: write to temp file then rename
            # os.replace() is atomic on POSIX and near-atomic on Windows
            fd, tmp_path = tempfile.mkstemp(
                dir=self._storage_path.parent,
                prefix=".secrets_",
                suffix=".tmp",
            )
            try:
                os.write(fd, encrypted)
                os.close(fd)
                fd = -1  # mark as closed

                # Restrict permissions on the temp file before renaming
                if platform.system() == "Windows":
                    self.restrict_windows_permissions(Path(tmp_path))
                else:
                    os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)

                os.replace(tmp_path, self._storage_path)
            except BaseException:
                # Clean up temp file on any failure
                if fd >= 0:
                    os.close(fd)
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise

            logger.debug("Secrets persisted to encrypted storage")
        except OSError as e:
            logger.error("Failed to persist secrets: %s", e)

    @staticmethod
    def restrict_windows_permissions(path: Path) -> None:
        """Restrict file to current user only on Windows using icacls.

        Note: Uses subprocess.run which is blocking. This is acceptable here
        because persist() is already called under a threading lock from
        synchronous set()/delete() methods.
        """
        import subprocess

        username = os.environ.get("USERNAME", "")
        if not username:
            logger.warning("Cannot restrict file permissions: USERNAME env var not set")
            return
        # Reject usernames with characters that could be used for injection
        import re
        if not re.fullmatch(r'[A-Za-z0-9._\- ]+', username):
            logger.warning("Refusing to use suspicious USERNAME value for icacls")
            return
        try:
            result = subprocess.run(
                ["icacls", str(path), "/inheritance:r",
                 "/grant:r", f"{username}:(R,W)", "/remove", "Everyone"],
                capture_output=True, check=False, timeout=10,
            )
            if result.returncode != 0:
                logger.warning(
                    "Failed to restrict Windows file permissions on %s (icacls rc=%d)",
                    path, result.returncode,
                )
        except subprocess.TimeoutExpired:
            logger.warning("icacls timed out for %s", path)
        except OSError as e:
            logger.warning("Failed to restrict Windows file permissions on %s: %s", path, e)

    def set(self, key: str, value: str) -> None:
        """
        Set a secret value.

        Updates memory and persists encrypted to disk.
        """
        with self._lock:
            self._secrets[key] = value
            self._last_update = datetime.now(UTC)
            self.persist()
        logger.info("Secret updated (key length: %d)", len(key))

    def delete(self, key: str) -> bool:
        """
        Delete a secret.

        Returns True if the key existed and was removed.
        """
        with self._lock:
            if key not in self._secrets:
                return False
            del self._secrets[key]
            self._last_update = datetime.now(UTC)
            self.persist()
        logger.info("Secret deleted (key length: %d)", len(key))
        return True

    def get(self, key: str, default: str | None = None) -> str | None:
        """Get a secret value."""
        with self._lock:
            return self._secrets.get(key, default)

    def has(self, key: str) -> bool:
        """Check if a secret exists."""
        with self._lock:
            return key in self._secrets

    def list_keys(self, prefix: str | None = None) -> list[str]:
        """List available secret keys, optionally filtered by prefix."""
        with self._lock:
            if prefix:
                return [k for k in self._secrets if k.startswith(prefix)]
            return list(self._secrets.keys())

    def get_configured_providers(self) -> dict[str, bool]:
        """Return a dict of provider -> has_key for all known providers."""
        with self._lock:
            return {
                provider: env_key in self._secrets
                for provider, env_key in PROVIDER_KEY_MAP.items()
            }

    def clear(self) -> None:
        """Clear all secrets from memory and disk."""
        with self._lock:
            self._secrets.clear()
            self._last_update = None
            self.persist()
        logger.info("Secrets store cleared")

    @property
    def last_update(self) -> datetime | None:
        """When secrets were last updated."""
        return self._last_update

    def get_provider_key(self, provider: str) -> str | None:
        """
        Get API key for an LLM provider.

        Convenience method that maps provider names to standard key names.
        """
        secret_key = PROVIDER_KEY_MAP.get(provider.lower())
        if secret_key:
            return self.get(secret_key)
        return None


# Global singleton instance
secrets_store = SecretsStore()


def get_secrets_store() -> SecretsStore:
    """Get the global secrets store instance."""
    return secrets_store
