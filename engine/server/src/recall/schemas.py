"""Recall testing schemas."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


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
