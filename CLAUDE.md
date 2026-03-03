# ModularMind V2

AI Agent Orchestration Platform — multi-model, multi-provider, with memory, RAG, and visual graph workflows.

## Architecture

```
ModularMind-V2/
├── apps/
│   ├── chat/          # Vite + React SPA (user-facing chat)
│   └── ops/           # Vite + React SPA (admin console)
├── packages/
│   ├── ui/            # shadcn/ui shared components
│   └── api-client/    # Typed HTTP client (@modularmind/api-client)
├── engine/
│   └── server/        # Python FastAPI (API + worker)
│       └── src/
│           ├── agents/         # Agent config (read-only from ConfigProvider)
│           ├── auth/           # JWT auth, roles, dependencies
│           ├── conversations/  # Chat conversations + messages
│           ├── executions/     # Execution runs, SSE streaming
│           ├── graph_engine/   # LangGraph compiler, state, tool loop
│           ├── graphs/         # Graph config (read-only)
│           ├── infra/          # DB, Redis, Qdrant, config, SSE, rate limit
│           ├── llm/            # LLM providers (Ollama, OpenAI, Anthropic)
│           ├── mcp/            # MCP tool registry + sidecars
│           ├── memory/         # Memory system (fact extraction, vector store)
│           ├── pipeline/       # Memory pipeline handlers (extractor, embedder)
│           ├── rag/            # RAG pipeline (chunker, retriever, reranker)
│           ├── sync/           # Platform sync (pull-based polling)
│           ├── report/         # Metrics reporting to Platform
│           └── worker/         # Redis Streams consumer + APScheduler
├── platform/          # Next.js 16 full-stack (admin + studio + marketing)
│   └── src/
│       ├── app/
│       │   ├── (admin)/    # Client/engine/settings management
│       │   ├── (studio)/   # Agent/graph editor, releases, templates
│       │   ├── (marketing)/ # Landing, features, pricing
│       │   ├── (auth)/     # Login, register
│       │   └── api/        # API routes (sync, engines, CRUD)
│       └── lib/            # Prisma, next-auth, engine-auth
├── shared/            # Python shared schemas (modularmind_shared)
└── docker/            # Docker Compose + Nginx configs
```

## Key Patterns

### Engine (Python)

- **No Celery** — all background work uses Redis Streams via `RedisStreamBus`
- **No WebSocket** — streaming uses SSE (`infra/sse.py`)
- **Config source**: `ConfigProvider` reads from DB (synced from Platform)
- **Worker**: single process runs Redis Streams consumers + APScheduler (`worker/runner.py`)
- **Streams**: `tasks:executions`, `tasks:models`, `memory:raw`, `memory:extracted`
- **Memory pipeline**: raw → extractor (LLM fact extraction) → embedder (Qdrant + PG)
- **Imports**: `from src.xxx` for engine code, `from modularmind_shared.xxx` for shared

### Frontend (TypeScript)

- **Monorepo**: pnpm workspaces + turbo
- **Shared UI**: `@modularmind/ui` (shadcn/ui components, theme system, shared constants)
- **API client**: `@modularmind/api-client` (typed HTTP, HttpOnly cookie auth, auto-refresh)
- **State**: Zustand for auth stores
- **Routing**: React Router DOM v7 (Chat + Ops), Next.js App Router (Platform)
- **Chat SSE**: EventSource API with `withCredentials: true`

### Theme & Styling

All 3 apps share a unified design system via `@modularmind/ui`:

- **No hardcoded colors** — never use `bg-blue-500`, `text-green-600`, etc. Always use semantic tokens: `bg-primary`, `text-muted-foreground`, `bg-success`, `text-destructive`, etc.
- **CSS tokens**: `packages/ui/src/styles/theme.css` defines all design tokens (`:root` + `.dark`) in HSL format. Every app imports this file.
- **Tailwind v4**: Colors mapped via `@theme { --color-primary: hsl(var(--primary)); }` in each app's global CSS. No `tailwind.config.js`.
- **ThemeProvider** (`packages/ui/src/theme/`): React context managing mode (light/dark/system), accent color (hue/saturation), and presets. Persists to localStorage (`mm-theme-*`).
- **Anti-FOUC**: Inline `<script>` in each app's HTML `<head>` reads localStorage and applies `dark` class + accent CSS vars before first paint.
- **Font**: Inter everywhere — CDN (`rsms.me/inter`) for Vite apps, `next/font/google` for Platform.
- **Shared base styles**: Font smoothing, line-height, selection color (primary), thin themed scrollbars, focus-visible ring — all defined in `theme.css`.
- **"use client"**: All UI components using React hooks must have `"use client"` at the top for Next.js SSR compatibility (harmless in Vite).

Available semantic color tokens: `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info` (each with `-foreground` variant), plus `card`, `popover`, `sidebar-*`, `border`, `input`, `ring`.

Shared color constant maps (import from `@modularmind/ui`): `CHANNEL_COLORS`, `STATUS_COLORS`, `ROLE_COLORS`, `ACTIVITY_COLORS`, `HEALTH_COLORS`.

Shared components (import from `@modularmind/ui`): `ThemeProvider`, `ThemeToggle`, `ThemeCustomizer`, `AppearanceCard`, `PageHeader`, `StatusBadge`, `ChannelBadge`, `UserButton`, plus all shadcn/ui primitives (Button, Badge, Card, Dialog, etc.).

### Platform (Next.js)

- **Auth**: next-auth v5 with credentials provider, JWT sessions
- **DB**: Prisma 6 + PostgreSQL
- **Sync**: Engine polls `GET /api/sync/manifest` with `X-Engine-Key` header

### Docker

- **Client deployment**: 7 containers (nginx, engine, worker, db, redis, qdrant, ollama)
- **Platform deployment**: 3 containers (platform, nginx, db)
- **Static SPAs**: baked into nginx image via multi-stage Dockerfile
- **Dev**: `docker compose -f docker/docker-compose.dev.yml up` for infra

## Commands

```bash
make setup          # Install all dependencies
make dev            # Start all services (Docker)
make dev-infra      # Start infra only (db, redis, qdrant, ollama)
make dev-engine     # Start engine (uvicorn --reload)
make dev-worker     # Start worker (redis streams + scheduler)
make dev-chat       # Start chat app (vite dev)
make dev-ops        # Start ops app (vite dev)
make dev-platform   # Start platform (next dev)
make build          # Build all apps
make deploy         # Deploy client stack
make test           # Run Python tests
make lint           # Run all linters
make migrate        # Run Alembic migrations
make db-push        # Push Prisma schema
```

## Conventions

- Python: ruff (E, F, I, UP, B, SIM), line-length 100, Python 3.12
- TypeScript: strict mode, paths alias `@/*` for platform
- Commits: conventional commits (fix/feat/chore), no force-push to main
- No `from shared.` imports — use `from modularmind_shared.`
- No Celery, no WebSocket — Redis Streams + SSE only
- No hardcoded Tailwind colors (`bg-blue-500`, `text-green-600`) — use semantic tokens (`bg-primary`, `text-success`)
- Reusable UI components go in `packages/ui`, not duplicated across apps
- All React components using hooks in `packages/ui` must have `"use client"` directive
