"""Credential service — encrypted storage and resolution for connector credentials."""

import logging
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.connectors.models import ConnectorCredential
from src.infra.secrets import get_secrets_store

logger = logging.getLogger(__name__)

MASK_VISIBLE_CHARS = 4


class MissingCredentialError(HTTPException):
    def __init__(self, connector_id: str):
        super().__init__(
            status_code=422,
            detail=f"No credential found for connector {connector_id}",
        )


class CredentialService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._store = get_secrets_store()

    async def store_credential(
        self,
        connector_id: str,
        credential_type: str,
        label: str,
        value: str,
        *,
        user_id: str | None = None,
        refresh_token: str | None = None,
        provider: str | None = None,
        scopes: list[str] | None = None,
    ) -> ConnectorCredential:
        encrypted_value = self._store.encrypt_value(value)
        encrypted_refresh = (
            self._store.encrypt_value(refresh_token) if refresh_token else None
        )

        credential = ConnectorCredential(
            id=str(uuid4()),
            connector_id=connector_id,
            user_id=user_id,
            credential_type=credential_type,
            label=label,
            encrypted_value=encrypted_value,
            encrypted_refresh_token=encrypted_refresh,
            provider=provider,
            scopes=scopes,
        )
        self.db.add(credential)
        await self.db.flush()
        logger.info(
            "Credential stored: %s for connector %s (type=%s, shared=%s)",
            credential.id,
            connector_id,
            credential_type,
            user_id is None,
        )
        return credential

    async def resolve_credential(
        self, connector_id: str, user_id: str | None = None
    ) -> ConnectorCredential:
        if user_id:
            result = await self.db.execute(
                select(ConnectorCredential).where(
                    ConnectorCredential.connector_id == connector_id,
                    ConnectorCredential.user_id == user_id,
                    ConnectorCredential.is_valid.is_(True),
                )
            )
            user_credential = result.scalar_one_or_none()
            if user_credential:
                return user_credential

        result = await self.db.execute(
            select(ConnectorCredential).where(
                ConnectorCredential.connector_id == connector_id,
                ConnectorCredential.user_id.is_(None),
                ConnectorCredential.is_valid.is_(True),
            )
        )
        shared_credential = result.scalar_one_or_none()
        if shared_credential:
            return shared_credential

        raise MissingCredentialError(connector_id)

    def decrypt_token(self, credential: ConnectorCredential) -> str:
        return self._store.decrypt_value(credential.encrypted_value)

    def decrypt_refresh_token(self, credential: ConnectorCredential) -> str | None:
        if not credential.encrypted_refresh_token:
            return None
        return self._store.decrypt_value(credential.encrypted_refresh_token)

    def decrypt_token_map(self, credential: ConnectorCredential) -> dict[str, str]:
        raw = self.decrypt_token(credential)
        if "|" in raw and "=" in raw:
            return dict(pair.split("=", 1) for pair in raw.split("|"))
        return {"token": raw}

    async def list_for_connector(self, connector_id: str) -> list[dict]:
        result = await self.db.execute(
            select(ConnectorCredential)
            .where(ConnectorCredential.connector_id == connector_id)
            .order_by(ConnectorCredential.created_at)
        )
        return [_redacted_credential(c) for c in result.scalars().all()]

    async def list_for_user(self, user_id: str) -> list[dict]:
        result = await self.db.execute(
            select(ConnectorCredential)
            .where(ConnectorCredential.user_id == user_id)
            .order_by(ConnectorCredential.created_at)
        )
        return [_redacted_credential(c) for c in result.scalars().all()]

    async def delete_credential(self, credential_id: str) -> None:
        result = await self.db.execute(
            select(ConnectorCredential).where(ConnectorCredential.id == credential_id)
        )
        credential = result.scalar_one_or_none()
        if not credential:
            raise HTTPException(status_code=404, detail="Credential not found")
        await self.db.delete(credential)
        logger.info("Credential deleted: %s", credential_id)

    async def invalidate_credential(self, credential_id: str) -> None:
        result = await self.db.execute(
            select(ConnectorCredential).where(ConnectorCredential.id == credential_id)
        )
        credential = result.scalar_one_or_none()
        if credential:
            credential.is_valid = False
            logger.info("Credential invalidated: %s", credential_id)

    async def has_credential(self, connector_id: str, user_id: str | None = None) -> bool:
        query = select(ConnectorCredential.id).where(
            ConnectorCredential.connector_id == connector_id,
            ConnectorCredential.is_valid.is_(True),
        )
        if user_id:
            query = query.where(ConnectorCredential.user_id == user_id)
        result = await self.db.execute(query.limit(1))
        return result.scalar_one_or_none() is not None


def _redacted_credential(credential: ConnectorCredential) -> dict:
    return {
        "id": credential.id,
        "connector_id": credential.connector_id,
        "user_id": credential.user_id,
        "credential_type": credential.credential_type,
        "label": credential.label,
        "provider": credential.provider,
        "scopes": credential.scopes,
        "is_valid": credential.is_valid,
        "is_shared": credential.user_id is None,
        "created_at": credential.created_at.isoformat() if credential.created_at else "",
        "updated_at": credential.updated_at.isoformat() if credential.updated_at else "",
    }
