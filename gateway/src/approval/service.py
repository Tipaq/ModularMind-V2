"""GatewayApprovalService — atomic DB-based approval decisions.

Uses PostgreSQL UPDATE WHERE status='pending' for race-free decisions.
Uses Redis pub/sub to notify waiting tool calls when decisions are made.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import timedelta
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import func, select, update

from src.approval.models import GatewayApprovalRule, GatewayPendingApproval
from src.approval.rules import MAX_RULES_PER_AGENT, validate_remember_pattern
from src.config import get_settings
from src.infra.database import utcnow
from src.infra.metrics import gateway_approvals_pending

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
settings = get_settings()


class GatewayApprovalService:
    """Manages the approval lifecycle.

    - Create pending approvals
    - Approve / reject atomically
    - Wait for decisions (Redis pub/sub)
    - "Approve & Remember" → create pre-approval rule
    """

    def __init__(self, db: AsyncSession, redis: Redis):
        self._db = db
        self._redis = redis

    async def request_approval(
        self,
        request_id: str,
        execution_id: str,
        agent_id: str,
        user_id: str,
        category: str,
        action: str,
        tool_name: str,
        args: dict[str, Any],
        timeout_seconds: int | None = None,
    ) -> str:
        """Create a pending approval record.

        Returns the approval_id.

        Raises RuntimeError if the agent exceeds max pending approvals.
        """
        timeout = timeout_seconds or settings.APPROVAL_TIMEOUT_SECONDS

        # Check agent pending limit
        count_result = await self._db.execute(
            select(func.count())
            .select_from(GatewayPendingApproval)
            .where(
                GatewayPendingApproval.agent_id == agent_id,
                GatewayPendingApproval.status == "pending",
            )
        )
        pending_count = count_result.scalar_one()
        if pending_count >= settings.APPROVAL_MAX_PENDING_PER_AGENT:
            raise RuntimeError(
                f"Agent {agent_id} has {pending_count} pending approvals "
                f"(max {settings.APPROVAL_MAX_PENDING_PER_AGENT})"
            )

        # Build preview (truncated for UI display)
        args_json = json.dumps(args, default=str)
        args_preview = args_json[:500]

        approval_id = str(uuid4())
        now = utcnow()

        approval = GatewayPendingApproval(
            id=approval_id,
            request_id=request_id,
            execution_id=execution_id,
            agent_id=agent_id,
            user_id=user_id,
            category=category,
            action=action,
            tool_name=tool_name,
            args_json=args_json,
            args_preview=args_preview,
            status="pending",
            timeout_at=now + timedelta(seconds=timeout),
            timeout_action="deny",
            created_at=now,
        )
        self._db.add(approval)
        await self._db.flush()

        # Update metrics
        gateway_approvals_pending.inc()

        # Publish SSE event for admin UI
        event_data = json.dumps(
            {
                "type": "approval_required",
                "approval_id": approval_id,
                "agent_id": agent_id,
                "execution_id": execution_id,
                "category": category,
                "action": action,
                "tool_name": tool_name,
                "args_preview": args_preview,
                "timeout_seconds": timeout,
            }
        )
        await self._redis.publish("gateway:approvals", event_data)

        logger.info(
            "Created approval %s for %s/%s (agent %s, timeout %ds)",
            approval_id,
            category,
            action,
            agent_id,
            timeout,
        )
        return approval_id

    async def approve(
        self,
        approval_id: str,
        admin_id: str,
        notes: str | None = None,
        remember: bool = False,
        remember_pattern: str | None = None,
    ) -> bool:
        """Atomically approve a pending request.

        Returns True if claimed, False if already processed.
        """
        now = utcnow()
        result = await self._db.execute(
            update(GatewayPendingApproval)
            .where(
                GatewayPendingApproval.id == approval_id,
                GatewayPendingApproval.status == "pending",
            )
            .values(
                status="approved",
                decision_by=admin_id,
                decision_at=now,
                decision_notes=notes,
                remember=remember,
                remember_pattern=remember_pattern,
            )
        )

        if result.rowcount == 0:
            return False

        await self._db.flush()
        gateway_approvals_pending.dec()

        # Notify waiting handler via Redis pub/sub
        await self._redis.publish(f"gateway:decision:{approval_id}", "approved")

        # "Approve & Remember" → create pre-approval rule
        if remember and remember_pattern:
            await self._create_rule_from_approval(approval_id, admin_id, remember_pattern)

        logger.info("Approval %s approved by %s", approval_id, admin_id)
        return True

    async def reject(
        self,
        approval_id: str,
        admin_id: str,
        notes: str | None = None,
    ) -> bool:
        """Atomically reject a pending request.

        Returns True if claimed, False if already processed.
        """
        now = utcnow()
        result = await self._db.execute(
            update(GatewayPendingApproval)
            .where(
                GatewayPendingApproval.id == approval_id,
                GatewayPendingApproval.status == "pending",
            )
            .values(
                status="rejected",
                decision_by=admin_id,
                decision_at=now,
                decision_notes=notes,
            )
        )

        if result.rowcount == 0:
            return False

        await self._db.flush()
        gateway_approvals_pending.dec()

        # Notify waiting handler
        await self._redis.publish(f"gateway:decision:{approval_id}", "rejected")

        logger.info("Approval %s rejected by %s", approval_id, admin_id)
        return True

    async def wait_for_decision(
        self,
        approval_id: str,
        timeout: int,
    ) -> str:
        """Wait for an approval decision using Redis pub/sub.

        Returns "approved", "rejected", or "timeout".
        """
        channel = f"gateway:decision:{approval_id}"
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(channel)

        try:
            deadline = time.time() + timeout
            while time.time() < deadline:
                remaining = max(0.1, deadline - time.time())
                wait_time = min(remaining, 0.1)
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=wait_time)
                if msg and msg["type"] == "message":
                    decision = msg["data"]
                    if isinstance(decision, bytes):
                        decision = decision.decode("utf-8")
                    return decision  # "approved" or "rejected"

            # Timeout — atomic claim
            now = utcnow()
            result = await self._db.execute(
                update(GatewayPendingApproval)
                .where(
                    GatewayPendingApproval.id == approval_id,
                    GatewayPendingApproval.status == "pending",
                )
                .values(
                    status="timeout",
                    decision_by="system:timeout",
                    decision_at=now,
                )
            )
            await self._db.flush()

            if result.rowcount > 0:
                gateway_approvals_pending.dec()
                logger.info("Approval %s timed out after %ds", approval_id, timeout)
                return "timeout"

            # Already processed by admin during our last sleep cycle
            return "already_processed"

        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def _create_rule_from_approval(
        self,
        approval_id: str,
        admin_id: str,
        pattern: str,
    ) -> None:
        """Create a pre-approval rule from an "Approve & Remember" decision."""
        # Load the approval to get context
        result = await self._db.execute(
            select(GatewayPendingApproval).where(GatewayPendingApproval.id == approval_id)
        )
        approval = result.scalar_one_or_none()
        if not approval:
            return

        # Validate the pattern
        error = validate_remember_pattern(pattern, approval.agent_id)
        if error:
            logger.warning("Skipping rule creation for approval %s: %s", approval_id, error)
            return

        # Check rule limit per agent
        count_result = await self._db.execute(
            select(func.count())
            .select_from(GatewayApprovalRule)
            .where(
                GatewayApprovalRule.agent_id == approval.agent_id,
                GatewayApprovalRule.is_active == True,  # noqa: E712
            )
        )
        rule_count = count_result.scalar_one()
        if rule_count >= MAX_RULES_PER_AGENT:
            logger.warning(
                "Agent %s has %d rules (max %d), skipping rule creation",
                approval.agent_id,
                rule_count,
                MAX_RULES_PER_AGENT,
            )
            return

        rule = GatewayApprovalRule(
            id=str(uuid4()),
            agent_id=approval.agent_id,
            category=approval.category,
            action=approval.action,
            pattern=pattern,
            description=f"Auto-created from approval {approval_id}",
            is_active=True,
            match_count=0,
            created_by=admin_id,
        )
        self._db.add(rule)
        await self._db.flush()

        logger.info(
            "Created rule %s from approval %s: %s/%s pattern=%s",
            rule.id,
            approval_id,
            approval.category,
            approval.action,
            pattern,
        )

    async def timeout_expired_approvals(self) -> int:
        """Mark all expired pending approvals as timed out.

        Called on startup and periodically. Returns count of timed-out approvals.
        """
        now = utcnow()
        result = await self._db.execute(
            update(GatewayPendingApproval)
            .where(
                GatewayPendingApproval.status == "pending",
                GatewayPendingApproval.timeout_at <= now,
            )
            .values(
                status="timeout",
                decision_by="system:timeout",
                decision_at=now,
            )
        )
        count = result.rowcount
        if count:
            await self._db.flush()
            logger.info("Timed out %d expired approvals", count)
        return count
