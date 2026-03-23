# ModularMind v3.0.0 — Release Notes

**Release Date:** 2025-09-15
**Type:** Major Release

## Overview

ModularMind v3.0 is a ground-up architecture rewrite. The monolithic Flask application has been replaced with a modern async stack: FastAPI + Redis Streams + Qdrant + LangGraph.

## Architecture Changes

### From v2.x to v3.0

| Component | v2.x | v3.0 |
|-----------|------|------|
| API Framework | Flask (sync) | FastAPI (async) |
| Task Queue | Celery + RabbitMQ | Redis Streams |
| Vector Store | FAISS (in-process) | Qdrant (separate service) |
| Streaming | WebSocket | SSE (Server-Sent Events) |
| Graph Engine | Custom state machine | LangGraph |
| Frontend | Single Jinja2 app | 3 SPAs (Chat, Ops, Platform) |
| UI Components | Bootstrap 5 | shadcn/ui + Tailwind v4 |
| Auth | Flask-Login sessions | JWT with HttpOnly cookies |

### New Components

- **Worker Process**: Dedicated process for Redis Streams consumers + APScheduler
- **Platform (Next.js)**: Full-stack admin application replacing the Flask admin
- **Shared UI Package**: `@modularmind/ui` with shadcn/ui components
- **API Client Package**: `@modularmind/api-client` with typed HTTP client
- **Memory System**: New multi-scope, multi-tier memory with fact extraction
- **RAG Pipeline**: New document processing pipeline with hybrid search

## Migration Guide from v2.x

### Step 1: Database Migration

The database schema has changed significantly. A migration script is provided:

```bash
# Export v2 data
python scripts/export_v2_data.py --output v2_export.json

# Initialize v3 database
cd engine/server
alembic upgrade head

# Import v2 data into v3 schema
python scripts/import_v2_to_v3.py --input v2_export.json
```

### Step 2: Configuration Migration

Agent configurations have moved from YAML files to the Platform database:

```bash
# Convert v2 YAML configs to v3 format
python scripts/migrate_configs.py --input config/agents/ --output seed/agents/
```

### Step 3: Infrastructure

Replace RabbitMQ with Redis (if not already using Redis for caching):
- Remove RabbitMQ from Docker Compose
- Add Qdrant container
- Update Redis configuration for Streams support

### Step 4: Frontend

The single-page frontend has been replaced with three separate apps:
- Chat SPA (user-facing): replaces the `/chat` routes
- Ops SPA (admin): replaces the `/admin` routes
- Platform (Next.js): new admin + studio + marketing site

### Step 5: Verify

```bash
make dev-infra     # Start infrastructure
make migrate       # Run migrations
make dev-engine    # Start API
make dev-worker    # Start worker
make dev-chat      # Verify chat works
make dev-ops       # Verify admin works
```

## Breaking Changes

- All API endpoints have changed (new REST structure)
- WebSocket endpoints removed (replaced by SSE)
- Celery task definitions no longer valid (use Redis Streams)
- Flask extensions no longer used (replaced by FastAPI dependencies)
- Frontend must be rebuilt from scratch

## Known Issues

- Performance regression on first request after cold start (~3s)
- Memory extraction not yet supporting non-English text (fixed in v3.1)
- Graph editor only supports linear flows (conditional routing in v3.1)