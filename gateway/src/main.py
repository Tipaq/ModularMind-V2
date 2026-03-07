"""Gateway FastAPI application — secure system access for AI agents."""

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.config import get_settings
from src.infra.database import close_db
from src.infra.redis import close_redis, get_redis_client
from src.audit.router import router as audit_router
from src.router import router
from src.sandbox.cleanup import cleanup_stale_sandboxes
from src.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    # ── Startup ──
    logger.info(
        "Starting %s v%s (env=%s)",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT,
    )

    # Verify Redis connectivity
    try:
        redis = await get_redis_client()
        if await redis.ping():
            logger.info("Redis connection verified")
        await redis.aclose()
    except Exception:
        logger.warning("Redis not available — SSE approval events will not work")

    # Initialize SandboxManager
    sandbox_mgr = SandboxManager()
    app.state.sandbox_manager = sandbox_mgr

    # Clean up orphaned sandboxes from previous runs
    try:
        removed = await sandbox_mgr.cleanup_orphaned()
        if removed:
            logger.info("Startup: cleaned %d orphaned sandbox(es)", removed)
    except Exception:
        logger.warning("Startup orphan cleanup failed", exc_info=True)

    # Recover expired pending approvals from before restart
    try:
        from src.approval.service import GatewayApprovalService
        from src.infra.database import async_session_maker

        async with async_session_maker() as session:
            redis = await get_redis_client()
            try:
                svc = GatewayApprovalService(session, redis)
                timed_out = await svc.timeout_expired_approvals()
                await session.commit()
                if timed_out:
                    logger.info("Startup: timed out %d expired approvals", timed_out)
            finally:
                await redis.aclose()
    except Exception:
        logger.warning("Startup approval recovery failed", exc_info=True)

    # Start APScheduler for periodic tasks
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        cleanup_stale_sandboxes,
        "interval",
        seconds=60,
        args=[sandbox_mgr],
        id="sandbox_cleanup",
    )
    scheduler.add_job(
        _run_approval_cleanup,
        "cron",
        hour=3, minute=0,
        id="approval_cleanup",
    )
    scheduler.start()
    app.state.scheduler = scheduler

    yield

    # ── Shutdown ──
    logger.info("Shutting down %s", settings.APP_NAME)
    scheduler.shutdown(wait=False)
    await sandbox_mgr.shutdown()
    await close_redis()
    await close_db()


async def _run_approval_cleanup() -> None:
    """Scheduled task: clean up resolved approvals older than retention period."""
    from src.approval.cleanup import cleanup_resolved_approvals
    from src.infra.database import async_session_maker

    try:
        async with async_session_maker() as session:
            await cleanup_resolved_approvals(session)
    except Exception:
        logger.warning("Approval cleanup job failed", exc_info=True)


app = FastAPI(
    title="ModularMind Gateway",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS — same pattern as engine
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Prometheus instrumentation
if settings.PROMETHEUS_ENABLED:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Mount routes
app.include_router(router)
app.include_router(audit_router)
