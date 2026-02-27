"""ModularMind Engine — Headless AI Agent Execution Runtime."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.infra.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # TODO: Initialize database, Redis, Qdrant connections
    # TODO: Leader election + singleton tasks
    # TODO: Load secrets, seed data, start metrics sampler
    # TODO: Recover MCP sidecars
    yield
    # Shutdown
    # TODO: Close connections, stop samplers


app = FastAPI(
    title="ModularMind Engine",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TODO: Mount routers
# app.include_router(health_router)
# app.include_router(auth_router, prefix="/api/v1/auth")
# app.include_router(agents_router, prefix="/api/v1/agents")
# ... etc.
