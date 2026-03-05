"""Recall testing schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from src.infra.schemas import PaginatedResponse


class RecallTestCase(BaseModel):
    """A single recall test case."""

    query: str
    expected_chunk_ids: list[str] = Field(default_factory=list)
    expected_document_ids: list[str] = Field(default_factory=list)
    expected_content_snippets: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class RecallTestSuite(BaseModel):
    """A suite of recall test cases."""

    name: str
    collection_id: str
    test_cases: list[RecallTestCase]


class RecallTestResult(BaseModel):
    """Result for a single test case."""

    test_case: RecallTestCase
    retrieved_chunk_ids: list[str]
    recall_at_k: float
    mrr: float
    ndcg: float
    latency_ms: float


class RecallTestSuiteResult(BaseModel):
    """Aggregate results for a full test suite."""

    suite_name: str
    results: list[RecallTestResult]
    avg_recall_at_k: float
    avg_mrr: float
    avg_ndcg: float
    avg_latency_ms: float
    timestamp: datetime


# ---------------------------------------------------------------------------
# Router request/response schemas
# ---------------------------------------------------------------------------


class RunSuiteRequest(BaseModel):
    """Run a recall test suite."""

    suite: RecallTestSuite
    search_params: dict = Field(default_factory=lambda: {"limit": 5, "threshold": 0.0})


class RunSuiteResponse(BaseModel):
    """Response for a recall test run."""

    id: str
    result: RecallTestSuiteResult


class HistoryItem(BaseModel):
    """A historical recall test run."""

    id: str
    suite_name: str
    collection_id: str
    avg_recall_at_k: float
    avg_mrr: float
    avg_ndcg: float
    avg_latency_ms: float
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryResponse(PaginatedResponse[HistoryItem]):
    """Historical recall test results."""
