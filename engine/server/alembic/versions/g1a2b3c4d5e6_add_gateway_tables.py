"""add_gateway_tables

Revision ID: g1a2b3c4d5e6
Revises: a9b0c1d2e3f4
Create Date: 2026-03-07

Gateway service tables:
- gateway_approval_rules: Pre-approval rules for auto-approving matching requests
- gateway_pending_approvals: Pending approval requests awaiting admin decision
- gateway_audit_log: Audit log for all gateway tool execution requests
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g1a2b3c4d5e6"
down_revision: Union[str, None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- gateway_approval_rules ---
    op.create_table(
        "gateway_approval_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("agent_id", sa.String(36), nullable=True, index=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("pattern", sa.String(500), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("match_count", sa.Integer(), default=0),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_gw_rules_agent_category",
        "gateway_approval_rules",
        ["agent_id", "category"],
    )

    # --- gateway_pending_approvals ---
    op.create_table(
        "gateway_pending_approvals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(36), unique=True, nullable=False),
        sa.Column("execution_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("args_json", sa.Text(), nullable=False),
        sa.Column("args_preview", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), default="pending", nullable=False, index=True),
        sa.Column("decision_by", sa.String(100), nullable=True),
        sa.Column("decision_at", sa.DateTime(), nullable=True),
        sa.Column("decision_notes", sa.String(500), nullable=True),
        sa.Column("remember", sa.Boolean(), default=False),
        sa.Column("remember_pattern", sa.String(500), nullable=True),
        sa.Column("timeout_at", sa.DateTime(), nullable=False),
        sa.Column("timeout_action", sa.String(10), default="deny", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_gw_pending_status_timeout",
        "gateway_pending_approvals",
        ["status", "timeout_at"],
    )
    op.create_index(
        "ix_gw_pending_agent_status",
        "gateway_pending_approvals",
        ["agent_id", "status"],
    )

    # --- gateway_audit_log ---
    op.create_table(
        "gateway_audit_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), nullable=False, index=True),
        sa.Column("execution_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("args_json", sa.Text(), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("result_preview", sa.String(1000), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_gw_audit_agent_created",
        "gateway_audit_log",
        ["agent_id", "created_at"],
    )
    op.create_index(
        "ix_gw_audit_created",
        "gateway_audit_log",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_table("gateway_audit_log")
    op.drop_table("gateway_pending_approvals")
    op.drop_table("gateway_approval_rules")
