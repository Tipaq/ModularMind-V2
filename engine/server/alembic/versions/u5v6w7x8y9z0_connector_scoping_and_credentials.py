"""connector_scoping_and_credentials

Revision ID: u5v6w7x8y9z0
Revises: t4n5o6p7q8r9
Create Date: 2026-04-08

Add user/project scoping and encrypted credential storage to connectors.
Migrates existing plaintext secrets from config JSONB to connector_credentials.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "u5v6w7x8y9z0"
down_revision: str | None = "t4n5o6p7q8r9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SECRET_KEYS_BY_TYPE: dict[str, set[str]] = {
    "slack": {"bot_token", "signing_secret"},
    "telegram": {"bot_token"},
    "whatsapp": {"access_token", "app_secret"},
    "discord": {"bot_token"},
    "teams": {"app_secret"},
    "email": set(),
}

CREDENTIAL_LABEL_BY_TYPE: dict[str, str] = {
    "slack": "Slack Bot",
    "telegram": "Telegram Bot",
    "whatsapp": "WhatsApp API",
    "discord": "Discord Bot",
    "teams": "Teams App",
    "email": "Email",
}


def upgrade() -> None:
    op.add_column("connectors", sa.Column("user_id", sa.String(36), nullable=True))
    op.add_column("connectors", sa.Column("project_id", sa.String(36), nullable=True))
    op.add_column("connectors", sa.Column("spec", JSONB, nullable=True))

    op.alter_column(
        "connectors", "connector_type",
        type_=sa.String(60), existing_type=sa.String(20),
    )

    op.create_foreign_key(
        "fk_connectors_user_id", "connectors", "users", ["user_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_connectors_project_id",
        "connectors",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_connectors_user_id", "connectors", ["user_id"])
    op.create_index("ix_connectors_project_id", "connectors", ["project_id"])

    op.create_table(
        "connector_credentials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "connector_id",
            sa.String(36),
            sa.ForeignKey("connectors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("credential_type", sa.String(30), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("encrypted_value", sa.Text, nullable=False),
        sa.Column("encrypted_refresh_token", sa.Text, nullable=True),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("scopes", JSONB, nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_valid", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_connector_credentials_connector_id",
        "connector_credentials", ["connector_id"],
    )
    op.create_index("ix_connector_credentials_user_id", "connector_credentials", ["user_id"])

    _migrate_secrets_to_credentials()


def _migrate_secrets_to_credentials() -> None:
    """Extract secret fields from config JSONB into encrypted credential rows."""
    from uuid import uuid4

    from src.infra.secrets import get_secrets_store

    store = get_secrets_store()

    conn = op.get_bind()
    connectors = conn.execute(
        sa.text("SELECT id, connector_type, config FROM connectors WHERE config IS NOT NULL")
    ).fetchall()

    for row in connectors:
        connector_id = row[0]
        connector_type = row[1]
        config = row[2] or {}

        if not isinstance(config, dict):
            continue

        secret_keys = SECRET_KEYS_BY_TYPE.get(connector_type, set())
        if not secret_keys:
            continue

        secret_values: dict[str, str] = {}
        for key in secret_keys:
            value = config.get(key, "")
            if value:
                secret_values[key] = value

        if not secret_values:
            continue

        combined_value = "|".join(f"{k}={v}" for k, v in sorted(secret_values.items()))
        try:
            encrypted = store.encrypt_value(combined_value)
        except RuntimeError:
            continue

        credential_id = str(uuid4())
        label = CREDENTIAL_LABEL_BY_TYPE.get(connector_type, connector_type.title())

        conn.execute(
            sa.text(
                "INSERT INTO connector_credentials "
                "(id, connector_id, user_id, credential_type, label, encrypted_value, is_valid) "
                "VALUES (:id, :connector_id, NULL, "
                ":credential_type, :label, :encrypted_value, true)"
            ),
            {
                "id": credential_id,
                "connector_id": connector_id,
                "credential_type": "bot_token",
                "label": label,
                "encrypted_value": encrypted,
            },
        )

        cleaned_config = {k: v for k, v in config.items() if k not in secret_keys}
        conn.execute(
            sa.text("UPDATE connectors SET config = :config WHERE id = :id"),
            {"config": sa.type_coerce(cleaned_config, JSONB), "id": connector_id},
        )


def downgrade() -> None:
    op.drop_table("connector_credentials")

    op.drop_index("ix_connectors_project_id", table_name="connectors")
    op.drop_index("ix_connectors_user_id", table_name="connectors")
    op.drop_constraint("fk_connectors_project_id", "connectors", type_="foreignkey")
    op.drop_constraint("fk_connectors_user_id", "connectors", type_="foreignkey")
    op.drop_column("connectors", "spec")
    op.drop_column("connectors", "project_id")
    op.drop_column("connectors", "user_id")

    op.alter_column(
        "connectors", "connector_type",
        type_=sa.String(20), existing_type=sa.String(60),
    )
