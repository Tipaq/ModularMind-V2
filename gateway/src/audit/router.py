"""Audit log query and export endpoints."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Query
from starlette.responses import StreamingResponse

from src.audit.service import AuditService
from src.auth import AdminUser
from src.infra.database import DbSession

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("")
async def query_audit_log(
    admin: AdminUser,
    db: DbSession,
    agent_id: str | None = None,
    execution_id: str | None = None,
    category: str | None = None,
    decision: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """Query audit log with filters and pagination."""
    svc = AuditService(db)
    entries, total = await svc.query(
        agent_id=agent_id,
        execution_id=execution_id,
        category=category,
        decision=decision,
        limit=limit,
        offset=offset,
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "entries": [
            {
                "id": e.id,
                "request_id": e.request_id,
                "agent_id": e.agent_id,
                "execution_id": e.execution_id,
                "user_id": e.user_id,
                "category": e.category,
                "action": e.action,
                "tool_name": e.tool_name,
                "decision": e.decision,
                "status": e.status,
                "error": e.error,
                "result_preview": e.result_preview,
                "duration_ms": e.duration_ms,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
    }


@router.get("/export")
async def export_audit_csv(
    admin: AdminUser,
    db: DbSession,
    agent_id: str | None = None,
    execution_id: str | None = None,
    category: str | None = None,
    decision: str | None = None,
    limit: int = Query(default=10000, ge=1, le=50000),
) -> StreamingResponse:
    """Export audit log as CSV."""
    svc = AuditService(db)
    entries, _ = await svc.query(
        agent_id=agent_id,
        execution_id=execution_id,
        category=category,
        decision=decision,
        limit=limit,
        offset=0,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "request_id", "agent_id", "execution_id", "user_id",
        "category", "action", "tool_name", "decision", "status",
        "error", "duration_ms", "created_at",
    ])
    for e in entries:
        writer.writerow([
            e.id, e.request_id, e.agent_id, e.execution_id, e.user_id,
            e.category, e.action, e.tool_name, e.decision, e.status,
            e.error or "", e.duration_ms or "",
            e.created_at.isoformat() if e.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gateway_audit.csv"},
    )
