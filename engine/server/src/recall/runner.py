"""Recall test runner — executes test suites and computes metrics."""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import UTC
from pathlib import Path

from src.embedding.resolver import get_knowledge_embedding_provider
from src.rag.vector_store import QdrantRAGVectorStore, RAGSearchResult

from .schemas import (
    RecallTestCase,
    RecallTestResult,
    RecallTestSuite,
    RecallTestSuiteResult,
)

logger = logging.getLogger(__name__)


class RecallTestRunner:
    """Runs recall test suites against the Qdrant knowledge collection."""

    def __init__(self) -> None:
        self._vector_store = QdrantRAGVectorStore()

    async def run_suite(
        self,
        suite: RecallTestSuite,
        search_params: dict | None = None,
    ) -> RecallTestSuiteResult:
        """Run all test cases in a suite and aggregate metrics."""
        from datetime import datetime

        params = search_params or {}
        k = params.get("limit", 5)
        threshold = params.get("threshold", 0.0)

        embedding_provider = get_knowledge_embedding_provider()

        from qdrant_client import models as qmodels

        collection_filter = qmodels.Filter(
            must=[
                qmodels.FieldCondition(
                    key="collection_id",
                    match=qmodels.MatchValue(value=suite.collection_id),
                ),
            ]
        )

        results: list[RecallTestResult] = []
        for tc in suite.test_cases:
            t0 = time.monotonic()

            query_embedding = await embedding_provider.embed_text(tc.query)
            search_results = await self._vector_store.search(
                query_embedding=query_embedding,
                query_text=tc.query,
                filters=collection_filter,
                limit=k,
                threshold=threshold,
            )

            latency_ms = (time.monotonic() - t0) * 1000

            recall = self.compute_recall_at_k(search_results, tc, k)
            mrr = self.compute_mrr(search_results, tc)
            ndcg = self.compute_ndcg(search_results, tc, k)

            results.append(
                RecallTestResult(
                    test_case=tc,
                    retrieved_chunk_ids=[r.chunk_id for r in search_results],
                    recall_at_k=recall,
                    mrr=mrr,
                    ndcg=ndcg,
                    latency_ms=round(latency_ms, 2),
                )
            )

        n = len(results) or 1
        return RecallTestSuiteResult(
            suite_name=suite.name,
            results=results,
            avg_recall_at_k=sum(r.recall_at_k for r in results) / n,
            avg_mrr=sum(r.mrr for r in results) / n,
            avg_ndcg=sum(r.ndcg for r in results) / n,
            avg_latency_ms=sum(r.latency_ms for r in results) / n,
            timestamp=datetime.now(UTC),
        )

    @staticmethod
    async def load_suite_from_file(path: Path) -> RecallTestSuite:
        """Load a test suite from a JSON or YAML file."""
        content = path.read_text(encoding="utf-8")

        if path.suffix in (".yaml", ".yml"):
            import yaml

            data = yaml.safe_load(content)
        else:
            data = json.loads(content)

        return RecallTestSuite(**data)

    @staticmethod
    def is_result_relevant(result: RAGSearchResult, tc: RecallTestCase) -> bool:
        """Check if a single result matches any expected field in the test case."""
        if tc.expected_document_ids and result.document_id in tc.expected_document_ids:
            return True

        if tc.expected_content_snippets:
            content_lower = result.content.lower()
            for snippet in tc.expected_content_snippets:
                if snippet.lower() in content_lower:
                    return True

        if tc.expected_chunk_ids and result.chunk_id in tc.expected_chunk_ids:
            return True

        return False

    def compute_recall_at_k(
        self,
        results: list[RAGSearchResult],
        tc: RecallTestCase,
        k: int,
    ) -> float:
        """Recall@K: fraction of expected items found in top-K results."""
        denominator = max(
            len(tc.expected_document_ids),
            len(tc.expected_content_snippets),
            len(tc.expected_chunk_ids),
        )
        if denominator == 0:
            return 0.0

        relevant_count = sum(
            1 for r in results[:k] if self.is_result_relevant(r, tc)
        )
        return relevant_count / denominator

    def compute_mrr(
        self,
        results: list[RAGSearchResult],
        tc: RecallTestCase,
    ) -> float:
        """Mean Reciprocal Rank: 1/rank of first relevant result."""
        for i, r in enumerate(results):
            if self.is_result_relevant(r, tc):
                return 1.0 / (i + 1)
        return 0.0

    def compute_ndcg(
        self,
        results: list[RAGSearchResult],
        tc: RecallTestCase,
        k: int,
    ) -> float:
        """Normalized Discounted Cumulative Gain (binary relevance)."""
        dcg = 0.0
        for i, r in enumerate(results[:k]):
            if self.is_result_relevant(r, tc):
                dcg += 1.0 / math.log2(i + 2)  # i+2 because rank starts at 1

        # Ideal DCG: all relevant items at the top
        ideal_count = max(
            len(tc.expected_document_ids),
            len(tc.expected_content_snippets),
            len(tc.expected_chunk_ids),
        )
        ideal_count = min(ideal_count, k)

        if ideal_count == 0:
            return 0.0

        idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_count))
        return dcg / idcg if idcg > 0 else 0.0
