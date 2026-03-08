"""
A/B testing module.

Routes execution traffic between control (base) and treatment (fine-tuned) models,
tracks per-variant metrics, and computes statistical significance.
"""

from __future__ import annotations

import json
import logging
import math
import random

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.executions.models import ExecutionRun
from src.fine_tuning.models import ABTestExperiment, ExperimentStatus

logger = logging.getLogger(__name__)

# Redis key pattern and TTL for experiment cache
_CACHE_KEY = "runtime:active_experiments:{agent_id}"
_CACHE_TTL = 60  # seconds


class ABTestRouter:
    """Routes execution traffic for A/B experiments."""

    def __init__(self, db: AsyncSession, redis_client=None):
        self.db = db
        self._redis = redis_client

    async def get_model_for_execution(
        self, agent_id: str, default_model_id: str
    ) -> tuple[str, str | None, str | None]:
        """Determine which model to use for an execution.

        Returns:
            (model_id, experiment_id, variant)
            variant is "control" or "treatment", or None if no experiment.
        """
        experiment = await self._get_cached_experiment(agent_id)
        if experiment is None:
            return default_model_id, None, None

        # Route based on traffic split
        if random.random() < experiment["traffic_split"]:
            return (
                experiment["treatment_model_id"],
                experiment["id"],
                "treatment",
            )
        return (
            experiment["control_model_id"],
            experiment["id"],
            "control",
        )

    async def record_execution_result(
        self,
        experiment_id: str,
        variant: str,
        execution_id: str,
        metrics: dict,
    ) -> None:
        """Record execution result for an experiment variant."""
        experiment = await self.db.get(ABTestExperiment, experiment_id)
        if experiment is None or experiment.status != ExperimentStatus.RUNNING:
            return

        if variant == "control":
            experiment.control_executions += 1
            _update_running_metrics(experiment.control_metrics, metrics)
        elif variant == "treatment":
            experiment.treatment_executions += 1
            _update_running_metrics(experiment.treatment_metrics, metrics)

        await self.db.commit()

    async def compute_experiment_results(self, experiment_id: str) -> dict:
        """Compute aggregate metrics and statistical significance."""
        experiment = await self.db.get(ABTestExperiment, experiment_id)
        if experiment is None:
            raise ValueError(f"Experiment not found: {experiment_id}")

        # Aggregate from tagged execution runs
        control_stats = await self._aggregate_variant_metrics(experiment_id, "control")
        treatment_stats = await self._aggregate_variant_metrics(experiment_id, "treatment")

        # Compute significance (z-test for proportions on error rate)
        p_value = None
        significant = False
        n_control = control_stats.get("n", 0)
        n_treatment = treatment_stats.get("n", 0)

        if n_control >= experiment.min_sample_size and n_treatment >= experiment.min_sample_size:
            p1 = control_stats.get("error_rate", 0)
            p2 = treatment_stats.get("error_rate", 0)
            p_value = _z_test_proportions(p1, p2, n_control, n_treatment)
            significant = p_value is not None and p_value < 0.05

        return {
            "control": control_stats,
            "treatment": treatment_stats,
            "p_value": p_value,
            "significant": significant,
        }

    async def _aggregate_variant_metrics(self, experiment_id: str, variant: str) -> dict:
        """Aggregate metrics from execution_runs tagged with this experiment/variant."""
        query = select(
            func.count(ExecutionRun.id).label("n"),
            func.avg(ExecutionRun.tokens_prompt + ExecutionRun.tokens_completion).label(
                "avg_tokens"
            ),
            func.avg(ExecutionRun.tokens_prompt).label("avg_tokens_prompt"),
            func.avg(ExecutionRun.tokens_completion).label("avg_tokens_completion"),
        ).where(
            and_(
                ExecutionRun.experiment_id == experiment_id,
                ExecutionRun.experiment_variant == variant,
            )
        )

        result = await self.db.execute(query)
        row = result.one_or_none()

        if row is None or row.n == 0:
            return {"n": 0}

        # Count errors for error rate
        error_query = select(func.count(ExecutionRun.id)).where(
            and_(
                ExecutionRun.experiment_id == experiment_id,
                ExecutionRun.experiment_variant == variant,
                ExecutionRun.status == "failed",
            )
        )
        error_result = await self.db.execute(error_query)
        error_count = error_result.scalar() or 0

        return {
            "n": row.n,
            "avg_tokens": float(row.avg_tokens or 0),
            "avg_tokens_prompt": float(row.avg_tokens_prompt or 0),
            "avg_tokens_completion": float(row.avg_tokens_completion or 0),
            "error_rate": error_count / row.n if row.n > 0 else 0,
            "error_count": error_count,
        }

    # -----------------------------------------------------------------------
    # Redis cache management
    # -----------------------------------------------------------------------

    async def _get_cached_experiment(self, agent_id: str) -> dict | None:
        """Cache-aside pattern for active experiments."""
        if self._redis is None:
            return await self._query_active_experiment(agent_id)

        cache_key = _CACHE_KEY.format(agent_id=agent_id)
        cached = self._redis.get(cache_key)
        if cached is not None:
            data = json.loads(cached)
            # None sentinel means "no active experiment"
            return data if data != "null" else None

        # Cache miss — query DB
        experiment = await self._query_active_experiment(agent_id)

        # Cache result (even None to avoid stampede)
        value = json.dumps(experiment) if experiment else '"null"'
        self._redis.setex(cache_key, _CACHE_TTL, value)

        return experiment

    async def _query_active_experiment(self, agent_id: str) -> dict | None:
        """Query DB for a RUNNING experiment for this agent."""
        query = select(ABTestExperiment).where(
            and_(
                ABTestExperiment.agent_id == agent_id,
                ABTestExperiment.status == ExperimentStatus.RUNNING,
            )
        )
        result = await self.db.execute(query)
        experiment = result.scalar_one_or_none()
        if experiment is None:
            return None
        return {
            "id": experiment.id,
            "control_model_id": experiment.control_model_id,
            "treatment_model_id": experiment.treatment_model_id,
            "traffic_split": experiment.traffic_split,
        }

    async def invalidate_cache(self, agent_id: str) -> None:
        """Invalidate cached experiment for an agent.

        MUST be called AFTER the DB transaction is committed.
        """
        if self._redis is None:
            return
        cache_key = _CACHE_KEY.format(agent_id=agent_id)
        self._redis.delete(cache_key)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _update_running_metrics(metrics: dict, new_result: dict) -> None:
    """Incrementally update running-average metrics."""
    for key in ("latency_ms", "tokens_prompt", "tokens_completion"):
        if key in new_result:
            current_avg = metrics.get(f"avg_{key}", 0)
            count = metrics.get("count", 0)
            new_val = new_result[key]
            # Incremental mean
            metrics[f"avg_{key}"] = (current_avg * count + new_val) / (count + 1)
    metrics["count"] = metrics.get("count", 0) + 1


def _z_test_proportions(p1: float, p2: float, n1: int, n2: int) -> float | None:
    """Two-proportion z-test. Returns p-value or None if computation fails."""
    if n1 == 0 or n2 == 0:
        return None
    p_pool = (p1 * n1 + p2 * n2) / (n1 + n2)
    if p_pool == 0 or p_pool == 1:
        return None

    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return None

    z = abs(p1 - p2) / se

    # Standard normal CDF approximation (Abramowitz and Stegun)
    p_value = 2 * (1 - _normal_cdf(z))
    return p_value


def _normal_cdf(x: float) -> float:
    """Standard normal CDF approximation (error < 7.5e-8)."""
    # Abramowitz and Stegun formula 26.2.17
    if x < 0:
        return 1 - _normal_cdf(-x)
    b1 = 0.319381530
    b2 = -0.356563782
    b3 = 1.781477937
    b4 = -1.821255978
    b5 = 1.330274429
    p = 0.2316419
    t = 1.0 / (1.0 + p * x)
    t2 = t * t
    t3 = t2 * t
    t4 = t3 * t
    t5 = t4 * t
    pdf = math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)
    return 1.0 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5)
