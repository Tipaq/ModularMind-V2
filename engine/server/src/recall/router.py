"""Recall testing API endpoints."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Query
from sqlalchemy import select

from src.auth import CurrentUser
from src.infra.database import DbSession

from .models import RecallTestRun
from .runner import RecallTestRunner
from .schemas import (
    HistoryItem,
    HistoryResponse,
    RecallTestSuite,
    RunSuiteRequest,
    RunSuiteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recall", tags=["Recall Testing"])


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/run", response_model=RunSuiteResponse)
async def run_suite(
    request: RunSuiteRequest,
    user: CurrentUser,
    db: DbSession,
) -> RunSuiteResponse:
    """Run a recall test suite and store the results."""
    runner = RecallTestRunner()
    result = await runner.run_suite(request.suite, request.search_params)

    # Persist to PG
    run_id = str(uuid4())
    run = RecallTestRun(
        id=run_id,
        suite_name=result.suite_name,
        collection_id=request.suite.collection_id,
        avg_recall_at_k=result.avg_recall_at_k,
        avg_mrr=result.avg_mrr,
        avg_ndcg=result.avg_ndcg,
        avg_latency_ms=result.avg_latency_ms,
        config=request.search_params,
        results_detail=result.model_dump(mode="json"),
    )
    db.add(run)
    await db.commit()

    return RunSuiteResponse(id=run_id, result=result)


@router.get("/results", response_model=HistoryResponse)
async def list_results(
    user: CurrentUser,
    db: DbSession,
    suite_name: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> HistoryResponse:
    """List historical recall test results."""
    query = select(RecallTestRun).order_by(RecallTestRun.created_at.desc())

    if suite_name:
        query = query.where(RecallTestRun.suite_name == suite_name)

    query = query.limit(limit)
    result = await db.execute(query)
    runs = list(result.scalars().all())

    return HistoryResponse(
        items=[HistoryItem.model_validate(r) for r in runs],
        total=len(runs),
    )


@router.post("/suites", status_code=201)
async def upload_suite(
    suite: RecallTestSuite,
    user: CurrentUser,
) -> dict:
    """Validate and acknowledge a test suite upload.

    The suite is validated via Pydantic and returned as confirmation.
    Suites are passed inline to /run — this endpoint validates format.
    """
    return {
        "name": suite.name,
        "collection_id": suite.collection_id,
        "test_case_count": len(suite.test_cases),
        "status": "valid",
    }
