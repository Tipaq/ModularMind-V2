"""Gateway API endpoints.

- POST /api/v1/execute — evaluate permissions + execute in sandbox
- POST /api/v1/release/{execution_id} — release sandbox for execution
- GET /api/v1/approvals/stream — SSE stream of approval events
- GET /api/v1/approvals/pending — list pending approvals
- POST /api/v1/approvals/{id}/approve — approve a pending approval
- POST /api/v1/approvals/{id}/reject — reject a pending approval
- GET /api/v1/rules — list pre-approval rules
- POST /api/v1/rules — create a pre-approval rule
- DELETE /api/v1/rules/{id} — delete a pre-approval rule
- GET /health — health check
"""

import asyncio
import json
import logging
import time
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, func, select
from starlette.responses import StreamingResponse

from src.approval.models import GatewayApprovalRule, GatewayPendingApproval
from src.approval.service import GatewayApprovalService
from src.audit.models import GatewayAuditLog
from src.auth import AdminUser, InternalAuth
from src.config import get_settings
from src.executors.browser import execute_browser
from src.executors.filesystem import SAFE_ACTIONS, execute_filesystem
from src.executors.network import execute_network
from src.executors.shell import execute_shell
from src.infra.database import DbSession
from src.infra.metrics import (
    gateway_request_duration_seconds,
    gateway_requests_total,
)
from src.infra.redis import get_redis_client
from src.permission_engine import EvalResult, PermissionEngine
from src.schemas import (
    ApprovalDecisionRequest,
    ApprovalResponse,
    ExecuteRequest,
    ExecuteResponse,
    HealthResponse,
    RuleCreateRequest,
    RuleResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


# =============================================================================
# Health
# =============================================================================


@router.get("/health", response_model=HealthResponse)
async def health_check(db: DbSession) -> HealthResponse:
    """Health check endpoint."""
    pending_count = await db.execute(
        select(func.count())
        .select_from(GatewayPendingApproval)
        .where(GatewayPendingApproval.status == "pending")
    )
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        approvals_pending=pending_count.scalar_one(),
    )


# =============================================================================
# Execute (engine → gateway internal call)
# =============================================================================


@router.post("/api/v1/execute", response_model=ExecuteResponse)
async def execute_tool(
    request: ExecuteRequest,
    http_request: Request,
    _auth: InternalAuth,
    db: DbSession,
) -> ExecuteResponse:
    """Execute a gateway tool call.

    1. Evaluate permissions
    2. If approved: acquire sandbox, execute, return result
    3. If denied: return error
    4. If requires approval: create pending, wait for decision, then execute or deny
    """
    start = time.time()

    perm_engine = PermissionEngine(db, cache_ttl=settings.PERMISSION_CACHE_TTL)

    result_str = None
    approval_id = None
    decision = "error"
    response_status = "error"

    # Pre-approved re-call: skip permission check, execute directly
    if request.approved_id:
        decision = "pre_approved"
        try:
            result_str = await _execute_in_sandbox(
                http_request, request, perm_engine,
            )
            response_status = "allowed"
            approval_id = request.approved_id
        except Exception as e:
            logger.error("Pre-approved execution error: %s", e, exc_info=True)
            error = str(e)
            response_status = "error"
            decision = "error"
    else:
        eval_result, error = await perm_engine.evaluate(
            agent_id=request.agent_id,
            category=request.category,
            action=request.action,
            tool_name=request.tool,
            args=request.args,
        )

        if eval_result == EvalResult.AUTO_APPROVE:
            decision = "auto_approved"
            try:
                result_str = await _execute_in_sandbox(
                    http_request, request, perm_engine,
                )
                response_status = "allowed"
            except Exception as e:
                logger.error("Sandbox execution error: %s", e, exc_info=True)
                error = str(e)
                response_status = "error"
                decision = "error"

        elif eval_result == EvalResult.AUTO_DENY:
            response_status = "denied"
            decision = "auto_denied"

        elif eval_result == EvalResult.REQUIRES_APPROVAL:
            # Return immediately — engine handles the wait
            try:
                approval_id = await _create_approval(request, db)
                response_status = "requires_approval"
                decision = "pending"
                error = None
            except Exception as e:
                logger.error("Approval creation error: %s", e, exc_info=True)
                error = str(e)
                response_status = "error"
                decision = "error"

    duration_ms = (time.time() - start) * 1000

    # Record metrics
    gateway_requests_total.labels(
        category=request.category,
        action=request.action,
        decision=decision,
    ).inc()
    gateway_request_duration_seconds.labels(category=request.category).observe(duration_ms / 1000)

    # Write audit log
    audit = GatewayAuditLog(
        id=str(uuid4()),
        request_id=request.request_id,
        agent_id=request.agent_id,
        execution_id=request.execution_id,
        user_id=request.user_id,
        category=request.category,
        action=request.action,
        tool_name=request.tool,
        args_json=json.dumps(request.args),
        decision=decision,
        result_preview=result_str[:1000] if result_str else None,
        error=error,
        status=response_status,
        duration_ms=duration_ms,
    )
    db.add(audit)
    await db.flush()

    return ExecuteResponse(
        request_id=request.request_id,
        status=response_status,
        result=result_str,
        error=error,
        approval_id=approval_id,
    )


async def _create_approval(request: ExecuteRequest, db) -> str:
    """Create a pending approval and return its ID immediately (non-blocking)."""
    redis = await get_redis_client()
    try:
        approval_svc = GatewayApprovalService(db, redis)
        return await approval_svc.request_approval(
            request_id=request.request_id,
            execution_id=request.execution_id,
            agent_id=request.agent_id,
            user_id=request.user_id,
            category=request.category,
            action=request.action,
            tool_name=request.tool,
            args=request.args,
            timeout_seconds=request.timeout_seconds,
        )
    finally:
        await redis.aclose()


async def _execute_in_sandbox(
    http_request: Request,
    request: ExecuteRequest,
    perm_engine: PermissionEngine,
) -> str:
    """Execute a tool call (sandbox-based or in-process)."""
    sandbox_mgr = http_request.app.state.sandbox_manager
    perms = await perm_engine.get_permissions(request.agent_id)
    if not perms:
        raise RuntimeError("No permissions found")

    if request.category == "browser":
        return await execute_browser(
            action=request.action,
            args=request.args,
            sandbox_mgr=sandbox_mgr,
            execution_id=request.execution_id,
        )
    if request.category == "network":
        return await execute_network(
            action=request.action,
            args=request.args,
            sandbox_mgr=sandbox_mgr,
            execution_id=request.execution_id,
        )

    if request.category == "shell":
        timeout = perms.shell.max_execution_seconds if perms else 30
        return await execute_shell(
            action=request.action,
            args=request.args,
            sandbox_mgr=sandbox_mgr,
            execution_id=request.execution_id,
            max_execution_seconds=timeout,
            agent_id=request.agent_id,
            permissions=perms,
        )

    if request.category == "filesystem":
        is_safe = request.action in SAFE_ACTIONS
        if not is_safe:
            try:
                await sandbox_mgr.acquire_or_reuse(
                    execution_id=request.execution_id,
                    agent_id=request.agent_id,
                    permissions=perms,
                )
            except RuntimeError:
                logger.warning(
                    "Sandbox pre-creation failed for filesystem action '%s', "
                    "will attempt fallback in executor",
                    request.action,
                )

        return await execute_filesystem(
            action=request.action,
            args=request.args,
            sandbox_mgr=sandbox_mgr,
            execution_id=request.execution_id,
            agent_id=request.agent_id,
            permissions=perms,
        )

    return f"Executor for category '{request.category}' not yet implemented"


# =============================================================================
# Release (engine → gateway internal call)
# =============================================================================


@router.post("/api/v1/release/{execution_id}")
async def release_sandbox(
    execution_id: str,
    http_request: Request,
    _auth: InternalAuth,
) -> dict:
    """Release sandbox for an execution."""
    sandbox_mgr = http_request.app.state.sandbox_manager
    released = await sandbox_mgr.release(execution_id)
    logger.info(
        "Release %s for execution %s",
        "completed" if released else "skipped (no sandbox)",
        execution_id,
    )
    return {"status": "ok", "released": released, "execution_id": execution_id}


# =============================================================================
# Approval SSE Stream
# =============================================================================


@router.get("/api/v1/approvals/stream")
async def stream_approvals(
    http_request: Request,
    admin: AdminUser,
) -> StreamingResponse:
    """SSE stream of approval events for admin dashboard."""

    async def generate():
        redis = await get_redis_client()
        pubsub = redis.pubsub()
        await pubsub.subscribe("gateway:approvals")
        try:
            while not await http_request.is_disconnected():
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg["type"] == "message":
                    data = msg["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    yield f"event: approval\ndata: {data}\n\n"
                else:
                    # Keep-alive
                    yield ": heartbeat\n\n"
                    await asyncio.sleep(5)
        finally:
            await pubsub.unsubscribe("gateway:approvals")
            await pubsub.aclose()
            await redis.aclose()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Approvals (admin endpoints)
# =============================================================================


@router.get("/api/v1/approvals/pending")
async def list_pending_approvals(
    admin: AdminUser,
    db: DbSession,
    agent_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List pending approval requests."""
    query = (
        select(GatewayPendingApproval)
        .where(GatewayPendingApproval.status == "pending")
        .order_by(GatewayPendingApproval.created_at.desc())
        .limit(limit)
    )
    if agent_id:
        query = query.where(GatewayPendingApproval.agent_id == agent_id)

    result = await db.execute(query)
    approvals = result.scalars().all()

    return [
        {
            "id": a.id,
            "request_id": a.request_id,
            "agent_id": a.agent_id,
            "category": a.category,
            "action": a.action,
            "tool_name": a.tool_name,
            "args_preview": a.args_preview,
            "timeout_at": a.timeout_at.isoformat(),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in approvals
    ]


@router.post("/api/v1/approvals/{approval_id}/approve", response_model=ApprovalResponse)
async def approve_request(
    approval_id: str,
    body: ApprovalDecisionRequest,
    admin: AdminUser,
    db: DbSession,
) -> ApprovalResponse:
    """Approve a pending approval request (atomic)."""
    redis = await get_redis_client()
    try:
        svc = GatewayApprovalService(db, redis)
        claimed = await svc.approve(
            approval_id=approval_id,
            admin_id=admin,
            notes=body.notes,
            remember=body.remember,
            remember_pattern=body.remember_pattern,
        )
    finally:
        await redis.aclose()

    if not claimed:
        return ApprovalResponse(
            approval_id=approval_id,
            status="already_processed",
            message="This approval was already processed by another admin or timed out.",
        )

    return ApprovalResponse(
        approval_id=approval_id,
        status="approved",
        message="Approved" + (" (rule created)" if body.remember else ""),
    )


@router.post("/api/v1/approvals/{approval_id}/reject", response_model=ApprovalResponse)
async def reject_request(
    approval_id: str,
    body: ApprovalDecisionRequest,
    admin: AdminUser,
    db: DbSession,
) -> ApprovalResponse:
    """Reject a pending approval request (atomic)."""
    redis = await get_redis_client()
    try:
        svc = GatewayApprovalService(db, redis)
        claimed = await svc.reject(
            approval_id=approval_id,
            admin_id=admin,
            notes=body.notes,
        )
    finally:
        await redis.aclose()

    if not claimed:
        return ApprovalResponse(
            approval_id=approval_id,
            status="already_processed",
            message="This approval was already processed by another admin or timed out.",
        )

    return ApprovalResponse(
        approval_id=approval_id,
        status="rejected",
    )


# =============================================================================
# Rules (admin endpoints)
# =============================================================================


@router.get("/api/v1/rules")
async def list_rules(
    admin: AdminUser,
    db: DbSession,
    agent_id: str | None = None,
    active_only: bool = True,
) -> list[RuleResponse]:
    """List pre-approval rules."""
    query = select(GatewayApprovalRule).order_by(GatewayApprovalRule.created_at.desc())
    if agent_id:
        query = query.where(GatewayApprovalRule.agent_id == agent_id)
    if active_only:
        query = query.where(GatewayApprovalRule.is_active == True)  # noqa: E712

    result = await db.execute(query)
    rules = result.scalars().all()

    return [
        RuleResponse(
            id=r.id,
            agent_id=r.agent_id,
            category=r.category,
            action=r.action,
            pattern=r.pattern,
            description=r.description,
            is_active=r.is_active,
            match_count=r.match_count,
            created_by=r.created_by,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rules
    ]


@router.post("/api/v1/rules", response_model=RuleResponse, status_code=201)
async def create_rule(
    body: RuleCreateRequest,
    admin: AdminUser,
    db: DbSession,
) -> RuleResponse:
    """Create a pre-approval rule manually."""
    rule = GatewayApprovalRule(
        id=str(uuid4()),
        agent_id=body.agent_id,
        category=body.category,
        action=body.action,
        pattern=body.pattern,
        description=body.description,
        is_active=True,
        match_count=0,
        created_by=admin,
    )
    db.add(rule)
    await db.flush()

    return RuleResponse(
        id=rule.id,
        agent_id=rule.agent_id,
        category=rule.category,
        action=rule.action,
        pattern=rule.pattern,
        description=rule.description,
        is_active=rule.is_active,
        match_count=rule.match_count,
        created_by=rule.created_by,
        created_at=rule.created_at.isoformat() if rule.created_at else "",
    )


@router.delete("/api/v1/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    admin: AdminUser,
    db: DbSession,
) -> None:
    """Delete a pre-approval rule."""
    result = await db.execute(delete(GatewayApprovalRule).where(GatewayApprovalRule.id == rule_id))
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rule {rule_id} not found",
        )
