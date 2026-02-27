"""Health endpoint for the worker process Docker healthcheck.

Exposed by the worker runner at /health on the configured port.
"""

# TODO: Health check returns status of:
# - Redis Streams consumers (connected, lag)
# - APScheduler (running jobs count)
# - Memory pipeline (processing rate)
