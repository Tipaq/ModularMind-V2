"""Prometheus metrics for Gateway service."""

from prometheus_client import Counter, Gauge, Histogram

# Request metrics
gateway_requests_total = Counter(
    "gateway_requests_total",
    "Total gateway tool execution requests",
    ["category", "action", "decision"],
)

gateway_request_duration_seconds = Histogram(
    "gateway_request_duration_seconds",
    "Time spent processing gateway requests",
    ["category"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Sandbox metrics
gateway_sandboxes_active = Gauge(
    "gateway_sandboxes_active",
    "Number of active sandbox containers",
)

# Approval metrics
gateway_approvals_pending = Gauge(
    "gateway_approvals_pending",
    "Number of pending approval requests",
)

gateway_approval_rules_total = Gauge(
    "gateway_approval_rules_total",
    "Total number of active pre-approval rules",
)

# Circuit breaker (reported by engine, but defined here for reference)
gateway_circuit_breaker_state = Gauge(
    "gateway_circuit_breaker_state",
    "Gateway circuit breaker state (0=closed, 1=open)",
)
