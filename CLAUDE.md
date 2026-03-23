# ModularMind V2

AI Agent Orchestration Platform — multi-model, multi-provider, with memory, RAG, visual graph workflows, and secure tool execution.

@.memory-bank/architecture.md
@.memory-bank/tech.md
@.memory-bank/context.md

## Coding Standards

@.rules/01-standards/1-clean-code.md
@.rules/01-standards/1-naming-conventions.md
@.rules/02-programming-languages/2-typescript.md
@.rules/02-programming-languages/2-typescript-naming-conventions.md
@.rules/02-programming-languages/2-python.md
@.rules/02-programming-languages/2-python-naming-conventions.md
@.rules/03-frameworks-and-libraries/3-react.md
@.rules/03-frameworks-and-libraries/3-tailwind@4.1.md
@.rules/04-tools-and-configurations/4-package-installation.md
@.rules/05-workflows-and-processes/5-bug-finder.md
@.rules/07-quality-assurance/7-testing-standards.md
@.rules/07-quality-assurance/7-testing-frontend.md
@.rules/07-quality-assurance/7-testing-backend.md
@.rules/07-quality-assurance/7-tests-units.md
@.rules/07-quality-assurance/7-tests-integration.md

## Global Rules

1. **No hardcoded colors** — always use semantic tokens (`bg-primary`, `text-success`), never raw Tailwind (`bg-blue-500`)
2. **No Celery, no WebSocket** — Redis Streams + SSE only
3. **Python imports**: `from src.xxx` (engine/gateway), `from modularmind_shared.xxx` (shared) — never `from shared.`
4. **`"use client"`** on all `packages/ui` components using React hooks
5. **UI primitives**: always from `@modularmind/ui` — never re-implement or use raw Radix
6. **Reusable components** go in `packages/ui`, not duplicated across apps
7. **Commits**: conventional commits, small & atomic, author `Tim North <tim@modularmind.dev>`
8. **Model IDs**: `provider:model` format (e.g., `ollama:llama3.2`, `openai:gpt-4o`)
9. **Tailwind v4**: no `tailwind.config.js` — colors via `@theme` in CSS, tokens in `theme.css`
10. **Gateway**: single worker only — never increase `--workers`

## Never Do

- Force-push to main
- Use Celery or WebSocket
- Import `from shared.` (use `from modularmind_shared.`)
- Use raw Radix primitives instead of `@modularmind/ui` wrappers
- Hardcode Tailwind color classes
- Modify `engine/server/src/infra/`, `entrypoint.sh`, `permission_engine.py`, or Prisma schema without asking
- Duplicate UI components across apps instead of putting them in `packages/ui`

## Architecture

```
apps/chat/         Vite + React 19 SPA (user chat, :3002)
apps/ops/          Vite + React 19 SPA (admin console, :3003, base /ops)
packages/ui/       @modularmind/ui — shared design system + components + hooks
packages/api-client/ @modularmind/api-client — typed HTTP client
engine/server/     Python FastAPI — core API + business logic (:8000)
gateway/           Python FastAPI — secure tool execution (:8200)
platform/          Next.js 16 — admin SaaS + studio (:3000)
shared/            modularmind_shared — Python shared schemas
docker/            Docker Compose stacks + Nginx
```

## Key Patterns

### Backend
- **Workers**: `worker-exec` (executions, models, scheduled tasks, APScheduler) + `worker-pipeline` (documents, memory). Controlled by `WORKER_STREAMS` and `WORKER_SCHEDULER` env vars.
- **Streams**: `tasks:executions`, `tasks:models`, `tasks:documents`, `memory:raw`, `memory:extracted`
- **Config**: `ConfigProvider` reads from DB, synced from Platform
- **Auth**: JWT (HttpOnly cookies), engine↔platform via HMAC-SHA256

### Frontend
- **State**: Zustand · **Routing**: React Router v7 (Vite apps), Next.js App Router (Platform)
- **SSE**: EventSource with `withCredentials: true`
- **Theme**: HSL tokens in `theme.css`, ThemeProvider (light/dark/system + accent), anti-FOUC script
- **Shared hooks**: adapter pattern in `@modularmind/ui` (`useChat`, `useConversations`, etc.)

### Styling
- Semantic tokens: `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info` (+`-foreground`)
- Color maps: `CHANNEL_COLORS`, `STATUS_COLORS`, `ROLE_COLORS`, `ACTIVITY_COLORS`, `HEALTH_COLORS`
- Tabs: underline style (not pill). Select: use `@modularmind/ui` wrappers. ChatPanel: for side-panel tabs.

## Commands

```bash
make dev-infra       # DB, Redis, Qdrant, MinIO, Ollama
make dev-engine      # uvicorn --reload :8000
make dev-worker      # All streams + scheduler (local dev)
make dev-gateway     # uvicorn --reload :8200
make dev-chat        # Vite :3002
make dev-ops         # Vite :3003
make dev-platform    # Next.js :3000
make build           # All TS apps (turbo)
make test            # pytest (shared + engine)
make lint            # ruff + turbo lint
make migrate         # Alembic upgrade (engine)
make db-push         # Prisma push (platform)
```

## Conventions

- Python: ruff (E, F, I, UP, B, SIM), line-length 100, Python 3.12
- TypeScript: strict mode, `@/*` path alias
- pnpm 10.31 + Turbo 2.3
- MCP servers: bootstrap via `MCP_BOOTSTRAP_SERVERS` env or register via API

## Service Ports

| Service | Port | Notes |
|---------|------|-------|
| Nginx | 80, 443 | External entry |
| Engine | 8000 | Internal (/api) |
| Worker Health | 8001 | Healthcheck |
| Gateway | 8200 | Internal (/gateway) |
| PostgreSQL | 5432 | Internal |
| Redis | 6379 | Internal |
| Qdrant | 6333 | Internal |
| MinIO | 9000, 9001 | S3 + console |
| Ollama | 11434 | Internal |
| Platform | 3000 | Internal |
| Chat (dev) | 3002 | Dev only |
| Ops (dev) | 3003 | Dev only |
| Grafana | 3333 | Optional |
| Prometheus | 9090 | Optional |
