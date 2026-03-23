# Architecture — ModularMind V2

## Monorepo Structure

| Path | Type | Role |
|------|------|------|
| `apps/chat/` | Vite + React 19 SPA | User-facing chat interface (port 3002) |
| `apps/ops/` | Vite + React 19 SPA | Admin console — monitoring, config, models, knowledge (port 3003, base `/ops`) |
| `packages/ui/` | Library | `@modularmind/ui` — shadcn/ui design system, shared components, hooks, theme |
| `packages/api-client/` | Library | `@modularmind/api-client` — typed HTTP client, HttpOnly cookie auth, auto-refresh |
| `engine/server/` | Python FastAPI | Core API + business logic (port 8000) |
| `gateway/` | Python FastAPI | Secure tool execution for agents — browser, shell, fs, network (port 8200) |
| `platform/` | Next.js 16 | Admin SaaS — studio, marketing, auth, engine management (port 3000) |
| `shared/` | Python lib | `modularmind_shared` — shared Pydantic schemas |
| `docker/` | Infra | Docker Compose stacks + Nginx configs |
| `monitoring/` | Infra | Prometheus + Grafana dashboards |

## Dependency Graph

```
apps/chat ──→ @modularmind/ui ──→ @modularmind/api-client
apps/ops  ──→ @modularmind/ui ──→ @modularmind/api-client
platform  ──→ @modularmind/ui (transpiled via next.config)

engine ──→ modularmind_shared
gateway (independent — no shared dep)

engine ←──HTTP──→ gateway (tool execution)
engine ←──poll──→ platform (sync manifest)
```

## Key Architectural Patterns

### Backend
- **No Celery** — Redis Streams via `RedisStreamBus` for all async work
- **No WebSocket** — SSE only (`infra/sse.py`)
- **Workers**: split by `WORKER_STREAMS` env — `worker-exec` (executions, models, scheduled tasks + APScheduler) and `worker-pipeline` (documents, memory). Controlled via `WORKER_STREAMS` and `WORKER_SCHEDULER` settings.
- **Stream names**: `tasks:executions`, `tasks:models`, `tasks:documents`, `memory:raw`, `memory:extracted`
- **Config source**: `ConfigProvider` (`domain_config/provider.py`) reads from DB, synced from Platform
- **LangGraph**: graph engine compiles agent graphs, runs tool loops
- **Supervisor**: hierarchical agent routing — intent parsing → sub-agent delegation
- **Memory pipeline**: raw → LLM fact extraction → Qdrant + PG embedding
- **RAG pipeline**: upload → text extraction → chunking (4 strategies) → embedding → Qdrant + PG metadata
- **MCP**: tool server registry with Docker sidecars (Brave, DuckDuckGo, Puppeteer, etc.)

### Frontend
- **State**: Zustand for auth stores
- **Routing**: React Router DOM v7 (Chat, Ops), Next.js App Router (Platform)
- **SSE**: EventSource API with `withCredentials: true`
- **Theme**: CSS custom properties (HSL) in `theme.css`, ThemeProvider (light/dark/system + accent), anti-FOUC inline script
- **Shared hooks**: `useChat`, `useConversations`, `useChatConfig` with adapter pattern in `@modularmind/ui`

### Auth
- **Engine**: JWT (access + refresh), HttpOnly cookies, role-based (`auth/dependencies.py`)
- **Platform**: next-auth v5, credentials provider, JWT sessions (1h sliding / 7d hard)
- **Engine↔Platform sync**: HMAC-SHA256 token + `X-Platform-User-Email` header
- **Engine↔Gateway**: `X-Engine-Key` header

### Infrastructure
- **Client deploy**: nginx + engine + worker + gateway + db + redis + qdrant + minio + ollama (optional)
- **Platform deploy**: platform + nginx + db (separate stack)
- **Pre-built images**: `ghcr.io/tipaq/*` for client distribution
- **Monitoring**: Prometheus + Grafana + Node Exporter + cAdvisor + PG/Redis exporters
- **SPAs baked into nginx** via multi-stage Dockerfile (engine builds chat+ops)
- **Gateway**: MUST run single worker (state consistency for sandbox/approval)

### Databases
- **Engine DB**: PostgreSQL 16 + Alembic migrations
- **Platform DB**: PostgreSQL 16 + Prisma 6
- **Vector**: Qdrant v1.13
- **Cache/Queue**: Redis 7
- **Object storage**: MinIO (S3-compatible)

## Critical — Do NOT Modify Without Asking

- `engine/server/src/infra/` — core DB, Redis, Qdrant, S3 connections
- `engine/server/entrypoint.sh` — runs migrations before boot
- `docker/docker-compose.yml` — production stack orchestration
- `packages/ui/src/styles/theme.css` — design system tokens (breaks all 3 apps)
- `platform/prisma/schema.prisma` — Platform data model (needs migration)
- `engine/server/alembic/` — migration chain integrity
- `gateway/src/permission_engine.py` — agent security boundary
- `gateway/src/sandbox/` — container isolation (security-critical)
