"""ModularMind Engine — Headless AI Agent Execution Runtime.

FastAPI application with lifespan-managed startup/shutdown, CORS middleware,
and structured exception handlers.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.infra.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Router imports
# ---------------------------------------------------------------------------

# Always-on routers
from src.admin.user_router import admin_user_router
from src.agents.router import router as agents_router
from src.automations.router import router as automations_router
from src.auth.router import router as auth_router
from src.connectors.router import router as connectors_router
from src.connectors.webhook_router import webhook_router
from src.conversations.router import admin_router as conversations_admin_router
from src.conversations.router import router as conversations_router
from src.executions.router import router as executions_router
from src.fine_tuning.router import router as fine_tuning_router
from src.graphs.router import router as graphs_router
from src.groups.router import router as groups_router
from src.health.router import router as health_router

from src.internal.router import router as internal_router
from src.mcp.router import router as mcp_admin_router
from src.mcp.usage_router import usage_router as mcp_usage_router
from src.models.router import router as models_admin_router
from src.models.usage_router import usage_router as models_usage_router
from src.rag.router import router as rag_router
from src.recall.router import router as recall_router
from src.report.router import router as report_router
from src.setup.router import router as setup_router
from src.supervisor.router import router as supervisor_router
from src.sync.router import router as sync_router

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown hooks."""

    # ── Startup ──────────────────────────────────────────────────────────

    # 0. Configure application logging (uvicorn only sets its own loggers)
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO
    logging.basicConfig(level=log_level, force=True)

    # 1. Verify Redis connectivity
    from src.infra.redis import check_redis_health

    redis_ok, _ = await check_redis_health()
    if redis_ok:
        logger.info("Redis connection verified")
    else:
        logger.warning("Redis is unreachable — some features may be degraded")

    # 2. Initialize HierarchicalContextManager (supervisor routing)
    if redis_ok:
        from src.infra.redis import get_redis_client
        from src.supervisor.context_manager import init_context_manager

        redis_client = await get_redis_client()
        init_context_manager(redis_client)
        logger.info("HierarchicalContextManager initialized")

        # Wire Redis into ConfigProvider for ephemeral agent storage
        from src.domain_config.provider import get_config_provider

        get_config_provider().set_redis(redis_client)

    # 3. Initialize Qdrant collections (knowledge)
    from src.infra.qdrant import qdrant_factory

    try:
        await qdrant_factory.ensure_collections()
        logger.info("Qdrant collections initialized")
    except (ConnectionError, OSError, TimeoutError) as exc:
        logger.warning("Qdrant initialization failed (non-fatal): %s", exc)

    # 3b. Initialize S3/MinIO buckets
    from src.infra.object_store import get_object_store

    try:
        store = get_object_store()
        await store.ensure_buckets([settings.S3_BUCKET_RAG, settings.S3_BUCKET_ATTACHMENTS])
        logger.info("S3 buckets initialized")
    except (OSError, ConnectionError) as exc:
        logger.warning("S3 bucket initialization failed (non-fatal): %s", exc)

    # 4. Load seed model catalog
    from src.models.service import get_model_service

    try:
        model_svc = get_model_service()
        seeded = model_svc.load_seed_catalog()
        if seeded:
            logger.info("Seeded %d model(s) from catalog", seeded)
    except (OSError, ValueError, KeyError) as exc:
        logger.warning("Model catalog seeding failed (non-fatal): %s", exc)

    # 5. Initialize MCP registry + recover sidecars
    from src.mcp.service import startup_mcp

    try:
        await startup_mcp()
        logger.info("MCP registry initialized, sidecars recovered")
    except (OSError, ConnectionError, RuntimeError) as exc:
        logger.warning("MCP startup failed (non-fatal): %s", exc)

    # 6. Initialize sync service
    from src.sync.service import SyncService

    sync_service = SyncService()
    try:
        await sync_service.initialize()
    except (OSError, ConnectionError, ValueError) as exc:
        logger.warning("Sync service initialization failed (non-fatal): %s", exc)

    # 7. MCP leader-only phase (auto-deploy free catalog entries)
    try:
        await startup_mcp(leader_only=True)
    except (OSError, ConnectionError, RuntimeError) as exc:
        logger.warning("MCP leader-only startup failed (non-fatal): %s", exc)

    logger.info(
        "ModularMind Engine started (env=%s)",
        settings.ENVIRONMENT,
    )

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────

    # Close Redis connections
    from src.infra.redis import close_redis

    try:
        await close_redis()
        logger.info("Redis connections closed")
    except (ConnectionError, OSError) as exc:
        logger.warning("Error closing Redis: %s", exc)

    # Shutdown MCP registry + sidecars
    from src.mcp.service import shutdown_mcp

    try:
        await shutdown_mcp()
        logger.info("MCP registry shut down")
    except (OSError, RuntimeError) as exc:
        logger.warning("Error shutting down MCP: %s", exc)

    # Close sync service
    try:
        await sync_service.close()
        logger.info("Sync service closed")
    except (OSError, ConnectionError) as exc:
        logger.warning("Error closing sync service: %s", exc)

    # Close Qdrant client
    try:
        await qdrant_factory.close()
        logger.info("Qdrant client closed")
    except (OSError, ConnectionError) as exc:
        logger.warning("Error closing Qdrant client: %s", exc)

    logger.info("ModularMind Engine shut down")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ModularMind Engine",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Prometheus instrumentation
# ---------------------------------------------------------------------------

from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=False,
    excluded_handlers=["/health", "/health/live", "/health/ready", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security headers middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers (CSP, X-Content-Type-Options, etc.) to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"detail": "Resource not found"},
    )


@app.exception_handler(409)
async def conflict_handler(request: Request, exc: Exception) -> JSONResponse:
    detail = getattr(exc, "detail", "Conflict")
    return JSONResponse(
        status_code=409,
        content={"detail": detail},
    )


@app.exception_handler(422)
async def validation_handler(request: Request, exc: Exception) -> JSONResponse:
    detail = getattr(exc, "detail", "Validation error")
    return JSONResponse(
        status_code=422,
        content={"detail": detail},
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Router mounting
# ---------------------------------------------------------------------------

API_PREFIX = "/api/v1"

# Health — mounted at root (no /api/v1 prefix)
app.include_router(health_router)

# ── Always-on API routers ────────────────────────────────────────────────
# These routers define their own prefix on the APIRouter (e.g. prefix="/agents"),
# so we only add the /api/v1 namespace prefix here.

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(agents_router, prefix=API_PREFIX)
app.include_router(graphs_router, prefix=API_PREFIX)
app.include_router(executions_router, prefix=API_PREFIX)
app.include_router(conversations_router, prefix=API_PREFIX)
app.include_router(rag_router, prefix=API_PREFIX)
app.include_router(models_usage_router, prefix=API_PREFIX)
app.include_router(mcp_usage_router, prefix=API_PREFIX)
app.include_router(setup_router, prefix=API_PREFIX)
app.include_router(connectors_router, prefix=API_PREFIX)
app.include_router(webhook_router, prefix=f"{API_PREFIX}/webhooks")
app.include_router(report_router, prefix=API_PREFIX)
app.include_router(sync_router, prefix=API_PREFIX)
app.include_router(recall_router, prefix=API_PREFIX)
app.include_router(supervisor_router, prefix=API_PREFIX)
app.include_router(groups_router, prefix=API_PREFIX)
app.include_router(automations_router)

# ── Admin routers ────────────────────────────────────────────────────────
app.include_router(internal_router, prefix=f"{API_PREFIX}/internal")
app.include_router(fine_tuning_router, prefix=API_PREFIX)
app.include_router(mcp_admin_router, prefix=f"{API_PREFIX}/internal")
app.include_router(models_admin_router, prefix=API_PREFIX)
app.include_router(admin_user_router, prefix=f"{API_PREFIX}/admin")
app.include_router(conversations_admin_router, prefix=f"{API_PREFIX}/admin")
