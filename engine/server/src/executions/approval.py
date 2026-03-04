"""Execution approval handling.

Provides the ApprovalService for managing human-in-the-loop approval
workflows. Uses atomic UPDATE WHERE for race condition prevention between
manual approve/reject and timeout checker.
"""

import json
import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.redis import RedisClient
from src.infra.utils import utcnow

from .models import ExecutionRun, ExecutionStatus

logger = logging.getLogger(__name__)


class ApprovalService:
    """Handles execution approval workflows.

    Core operations:
    - request_approval: Set execution to AWAITING_APPROVAL + notify
    - approve / reject: Atomic claim with UPDATE WHERE
    - handle_timeouts: Scheduler scans for expired approvals
    """

    def __init__(self, db: AsyncSession, redis_client: RedisClient):
        self.db = db
        self.redis = redis_client

    async def request_approval(
        self,
        execution_id: str,
        node_id: str,
        node_config: dict[str, Any],
    ) -> None:
        """Set execution to AWAITING_APPROVAL status.

        Called when execution hits an interrupt_before node with
        requiresApproval=true.

        Args:
            execution_id: The execution run ID
            node_id: Node that triggered the approval request
            node_config: Node's config dict (approvalTimeout, approvalWebhookUrl, etc.)
        """
        timeout_seconds = node_config.get("approvalTimeout", 3600)  # Default 1h
        webhook_url = node_config.get("approvalWebhookUrl")

        run = await self.db.get(ExecutionRun, execution_id)
        if not run:
            logger.error("Execution %s not found for approval request", execution_id)
            return

        run.status = ExecutionStatus.AWAITING_APPROVAL
        run.approval_node_id = node_id
        run.approval_timeout_at = utcnow() + timedelta(seconds=timeout_seconds)
        run.approval_webhook_url = webhook_url
        run.approval_decision = None
        run.approved_by = None
        run.approved_at = None
        run.approval_notes = None
        await self.db.commit()

        # Publish event to Redis
        await self._publish_event(execution_id, {
            "type": "approval_required",
            "execution_id": execution_id,
            "node_id": node_id,
            "timeout_at": run.approval_timeout_at.isoformat(),
            "timeout_seconds": timeout_seconds,
        })

        # Send outbound webhook notification
        if webhook_url:
            from .webhook import send_approval_webhook

            webhook_secret = node_config.get("approvalWebhookSecret")
            await send_approval_webhook(
                webhook_url, execution_id, node_id, timeout_seconds,
                secret=webhook_secret,
            )

    async def approve(
        self,
        execution_id: str,
        user_id: str,
        notes: str | None = None,
    ) -> bool:
        """Approve an execution and prepare it for resumption.

        Uses atomic UPDATE WHERE to prevent race condition with timeout
        checker. Only one of approve/reject/timeout will succeed.

        Args:
            execution_id: The execution run ID
            user_id: ID of the approving user
            notes: Optional approval notes

        Returns:
            True if approval was claimed successfully, False if already processed
        """
        now = utcnow()

        result = await self.db.execute(
            update(ExecutionRun)
            .where(
                ExecutionRun.id == execution_id,
                ExecutionRun.status == ExecutionStatus.AWAITING_APPROVAL,
            )
            .values(
                approval_decision="approved",
                approved_by=user_id,
                approved_at=now,
                approval_notes=notes,
                status=ExecutionStatus.PENDING,
            )
            .returning(ExecutionRun.id, ExecutionRun.approval_node_id)
        )
        row = result.first()
        await self.db.commit()

        if row is None:
            return False  # Already processed (timeout or concurrent reject)

        _, node_id = row

        await self._publish_event(execution_id, {
            "type": "approval_granted",
            "execution_id": execution_id,
            "approved_by": user_id,
            "node_id": node_id,
        })

        logger.info(
            "Execution %s approved by %s (node %s)",
            execution_id, user_id, node_id,
        )
        return True

    async def reject(
        self,
        execution_id: str,
        user_id: str,
        notes: str | None = None,
    ) -> bool:
        """Reject an execution.

        Uses atomic UPDATE WHERE to prevent race condition.

        Args:
            execution_id: The execution run ID
            user_id: ID of the rejecting user
            notes: Optional rejection reason

        Returns:
            True if rejection was claimed successfully
        """
        now = utcnow()

        result = await self.db.execute(
            update(ExecutionRun)
            .where(
                ExecutionRun.id == execution_id,
                ExecutionRun.status == ExecutionStatus.AWAITING_APPROVAL,
            )
            .values(
                approval_decision="rejected",
                approved_by=user_id,
                approved_at=now,
                approval_notes=notes,
                status=ExecutionStatus.STOPPED,
                completed_at=now,
            )
            .returning(ExecutionRun.id, ExecutionRun.approval_node_id)
        )
        row = result.first()
        await self.db.commit()

        if row is None:
            return False

        _, node_id = row

        await self._publish_event(execution_id, {
            "type": "approval_rejected",
            "execution_id": execution_id,
            "rejected_by": user_id,
            "node_id": node_id,
            "notes": notes,
        })

        logger.info(
            "Execution %s rejected by %s (node %s)",
            execution_id, user_id, node_id,
        )
        return True

    async def handle_timeouts(self) -> int:
        """Check for timed-out approvals. Called by APScheduler.

        Uses atomic UPDATE WHERE per-row to prevent race with manual
        approve/reject. Reads node config from graph definition to
        determine timeout action (approve vs reject).

        Returns:
            Number of timed-out executions processed
        """
        stmt = select(ExecutionRun).where(
            ExecutionRun.status == ExecutionStatus.AWAITING_APPROVAL,
            ExecutionRun.approval_timeout_at <= utcnow(),
        )
        result = await self.db.execute(stmt)
        candidates = list(result.scalars().all())

        count = 0
        for run in candidates:
            node_config = await self._get_node_config(run)
            timeout_action = node_config.get("timeoutAction", "reject")

            now = utcnow()
            if timeout_action == "approve":
                new_status = ExecutionStatus.PENDING
                decision = "timeout_approved"
                completed_at = None
            else:
                new_status = ExecutionStatus.STOPPED
                decision = "timeout_rejected"
                completed_at = now

            # Atomic claim — only succeeds if still AWAITING_APPROVAL
            claim = await self.db.execute(
                update(ExecutionRun)
                .where(
                    ExecutionRun.id == run.id,
                    ExecutionRun.status == ExecutionStatus.AWAITING_APPROVAL,
                )
                .values(
                    approval_decision=decision,
                    approved_by="system:timeout",
                    approved_at=now,
                    status=new_status,
                    completed_at=completed_at,
                )
                .returning(ExecutionRun.id)
            )
            claimed = claim.scalar_one_or_none()
            if claimed is None:
                continue  # Already approved/rejected by user

            await self._publish_event(str(run.id), {
                "type": "approval_timeout",
                "execution_id": str(run.id),
                "node_id": run.approval_node_id,
                "action": timeout_action,
            })
            count += 1

        if count:
            await self.db.commit()
            logger.info("Processed %d approval timeout(s)", count)

        return count

    async def _get_node_config(self, run: ExecutionRun) -> dict[str, Any]:
        """Get the approval node's config from graph definition.

        Uses approval_node_id + graph_id to look up the node in the
        graph config via ConfigProvider.
        """
        if not run.approval_node_id or not run.graph_id:
            return {}

        from src.domain_config.provider import get_config_provider

        config_provider = get_config_provider()
        graph_config = await config_provider.get_graph_config(run.graph_id)
        if not graph_config:
            return {}

        for node in graph_config.nodes:
            node_id = node.id if hasattr(node, "id") else node.get("id")
            if node_id == run.approval_node_id:
                data = node.data if hasattr(node, "data") else node.get("data", {})
                return data.get("config", {})

        return {}

    async def _publish_event(self, execution_id: str, event: dict[str, Any]) -> None:
        """Publish event to Redis pub/sub and buffer with proper seq number.

        Uses atomic INCR on seq:{execution_id} so the SSE relay
        doesn't filter out the event as already-seen.
        """
        try:
            seq = await self.redis.incr(f"seq:{execution_id}")
            event["seq"] = seq
            event_json = json.dumps(event, default=str)
            buf_key = f"buffer:{execution_id}"
            listeners = await self.redis.publish(f"execution:{execution_id}", event_json)
            await self.redis.rpush(buf_key, event_json)
            await self.redis.ltrim(buf_key, -2000, -1)
            await self.redis.expire(buf_key, 60)
            logger.info(
                "Published approval event type=%s seq=%d for execution %s (listeners=%d)",
                event.get("type"), seq, execution_id, listeners,
            )
        except Exception as e:
            logger.warning("Failed to publish approval event: %s", e)
