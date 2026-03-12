# ModularMind V2

AI Agent Orchestration Platform — multi-model, multi-provider, with memory, RAG, visual graph workflows, and secure tool execution.

## Architecture

```
ModularMind-V2/
├── apps/
│   ├── chat/          # Vite + React SPA (user-facing chat)
│   └── ops/           # Vite + React SPA (admin console)
├── packages/
│   ├── ui/            # shadcn/ui shared components (@modularmind/ui)
│   └── api-client/    # Typed HTTP client (@modularmind/api-client)
├── engine/
│   └── server/        # Python FastAPI (API + worker)
│       └── src/
│           ├── agents/         # Agent config (read-only from ConfigProvider)
│           ├── auth/           # JWT auth, roles, dependencies
│           ├── conversations/  # Chat conversations + messages
│           ├── domain_config/  # ConfigProvider (DB-backed config source)
│           ├── executions/     # Execution runs, SSE streaming
│           ├── gateway/        # Gateway tool executor + tool definitions
│           ├── graph_engine/   # LangGraph compiler, state, tool loop
│           ├── graphs/         # Graph config (read-only)
│           ├── infra/          # DB, Redis, Qdrant, S3, SSE, rate limit
│           ├── llm/            # LLM providers (Ollama, OpenAI, Anthropic, vLLM, TGI)
│           ├── mcp/            # MCP tool registry + Docker sidecars
│           ├── memory/         # Memory system (fact extraction, vector store)
│           ├── models/         # Model discovery + usage tracking
│           ├── pipeline/       # Memory pipeline handlers (extractor, embedder)
│           ├── rag/            # RAG pipeline (chunker, retriever, reranker)
│           ├── report/         # Metrics reporting to Platform
│           ├── supervisor/     # Hierarchical agent routing (multi-agent)
│           ├── sync/           # Platform sync (pull-based polling)
│           └── worker/         # Redis Streams consumer + APScheduler
├── gateway/           # Secure system access for agents (browser, shell, fs, network)
│   └── src/
│       ├── executors/          # Browser, network, filesystem, shell executors
│       ├── approval/           # Human-in-the-loop approval workflow
│       ├── audit/              # Audit logging for all tool executions
│       ├── sandbox/            # Docker sandbox manager (isolated containers)
│       ├── infra/              # DB, Redis, middleware, metrics
│       └── permission_engine.py # Permission checks per agent config
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
├── docker/            # Docker Compose + Nginx configs
│   ├── docker-compose.yml           # Production client stack
│   ├── docker-compose.dev.yml       # Dev infra (db, redis, qdrant, minio)
│   ├── docker-compose.platform.yml  # Platform stack
│   └── docker-compose.monitoring.yml # Prometheus + Grafana
└── monitoring/        # Prometheus + Grafana dashboards
```

## Key Patterns

### Engine (Python)

- **No Celery** — all background work uses Redis Streams via `RedisStreamBus`
- **No WebSocket** — streaming uses SSE (`infra/sse.py`)
- **Config source**: `ConfigProvider` (`domain_config/provider.py`) reads from DB (synced from Platform)
- **Worker**: single process runs Redis Streams consumers + APScheduler (`worker/runner.py`)
- **Streams**: `tasks:executions`, `tasks:models`, `tasks:documents`, `memory:raw`, `memory:extracted`
- **Memory pipeline**: raw → extractor (LLM fact extraction) → embedder (Qdrant + PG)
- **RAG pipeline**: upload → extract text → chunk (4 strategies) → embed → Qdrant + PG metadata
- **Supervisor**: hierarchical agent routing — parses user intent, delegates to sub-agents
- **Gateway integration**: engine defines gateway tools in `gateway/tool_definitions.py`, executor calls gateway API
- **LLM model IDs**: `provider:model` format (e.g., `ollama:llama3.2`, `openai:gpt-4o`)
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

### Generic UI Components

Always use the generic components from `@modularmind/ui` — never re-implement tabs, selects, or other primitives with custom markup.

- **Tabs**: Use `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@modularmind/ui`. The base style is border-bottom (underline indicator, not pill/rounded). Never build custom tab bars with raw `<button>` elements. For URL-synced tabs, wire `value`/`onValueChange` to `useSearchParams`. Icons can be placed directly inside `<TabsTrigger>` (the base includes `gap-2`).
- **Select**: Use `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@modularmind/ui`. For filter bars, use the `ResourceFilters` shared component which wraps Select internally.
- **ChatPanel**: For side-panel tabs (chat insights), use the `ChatPanel` wrapper from `@modularmind/ui` which adds drag-to-scroll and compact sizing on top of the base Tabs.
- Do **not** use raw Radix primitives (`@radix-ui/react-tabs`, `@radix-ui/react-select`) directly — always go through the `@modularmind/ui` wrappers which apply the design system styling.

### Gateway (Python)

- **Separate FastAPI service** on :8200 — provides browser, shell, filesystem, network tools to agents
- **Permission engine**: agent config defines allowed actions per executor (paths, commands, domains)
- **Approval workflow**: high-risk actions trigger SSE event → user approves/denies in chat (5 min timeout)
- **Sandbox**: Docker containers (`modularmind/gateway-sandbox`) with resource limits, isolated per-agent workspaces
- **Audit logging**: every tool execution logged with full context
- **Imports**: `from src.xxx` (same pattern as engine)

### Platform (Next.js)

- **Auth**: next-auth v5 with credentials provider, JWT sessions (1h sliding, 7d hard expiry)
- **DB**: Prisma 6 + PostgreSQL
- **Sync**: Engine polls `GET /api/sync/manifest` with `X-Engine-Key` header
- **Engine proxy**: API routes proxy to engine with HMAC-SHA256 token + `X-Platform-User-Email` header

### Docker

- **Client deployment**: 7+ containers (nginx, engine, worker, gateway, db, redis, qdrant, minio, ollama)
- **Platform deployment**: 3 containers (platform, nginx, db)
- **Monitoring stack**: Prometheus + Grafana + Node Exporter + cAdvisor + PG/Redis exporters
- **Static SPAs**: baked into nginx image via multi-stage Dockerfile
- **Dev**: `docker compose -f docker/docker-compose.dev.yml up` for infra
- **MCP sidecars**: Docker images for tool servers (Brave, DuckDuckGo, Puppeteer, etc.)

## Commands

```bash
# Setup
make setup              # Install all dependencies (pnpm + pip), copy .env

# Development
make dev                # Start all services (Docker Compose)
make dev-infra          # Start infra only (db, redis, qdrant, minio, ollama)
make dev-engine         # Start engine (uvicorn --reload :8000)
make dev-worker         # Start worker (redis streams + scheduler)
make dev-gateway        # Start gateway (uvicorn --reload :8200)
make dev-chat           # Start chat app (vite dev :3002)
make dev-ops            # Start ops app (vite dev :3003)
make dev-platform       # Start platform (next dev :3000)
make dev-monitoring     # Start Prometheus + Grafana

# Build
make build              # Build all apps (turbo)
make build-docker       # Build Docker images (client stack)
make build-platform     # Build Platform Docker image
make build-gateway      # Build Gateway Docker image
make build-mcp-sidecars # Build MCP sidecar Docker images

# Deploy
make deploy             # Deploy client stack
make deploy-platform    # Deploy platform stack

# Test & Lint
make test               # Run Python tests (shared + engine)
make test-cov           # Run tests with coverage report
make lint               # Run all linters (ruff + turbo lint)
make lint-fix           # Auto-fix lint issues

# Database
make migrate            # Run Alembic migrations (engine)
make migrate-new        # Create new auto-generated migration
make db-push            # Push Prisma schema (platform)
```

## Conventions

- Python: ruff (E, F, I, UP, B, SIM), line-length 100, Python 3.12
- TypeScript: strict mode, paths alias `@/*` for platform
- Commits: conventional commits (fix/feat/chore), no force-push to main
- Commits must be small and atomic — group related changes only, avoid bundling unrelated files
- Commit messages must be explicit and descriptive — explain the "why", not just the "what"
- Always set the user as commit author: `Tim North <tim@modularmind.dev>`
- No `from shared.` imports — use `from modularmind_shared.`
- No Celery, no WebSocket — Redis Streams + SSE only
- No hardcoded Tailwind colors (`bg-blue-500`, `text-green-600`) — use semantic tokens (`bg-primary`, `text-success`)
- Reusable UI components go in `packages/ui`, not duplicated across apps
- All React components using hooks in `packages/ui` must have `"use client"` directive
- Always use generic UI components from `@modularmind/ui` (Tabs, Select, etc.) — never re-implement with raw HTML/buttons
- LLM model IDs: `provider:model` format (e.g., `ollama:llama3.2`, `openai:gpt-4o`)
- Gateway imports: `from src.xxx` (same pattern as engine)
- MCP servers: bootstrap via `MCP_BOOTSTRAP_SERVERS` env var or register via API

## Service Ports

| Service | Port | Notes |
|---------|------|-------|
| Nginx | 80, 443 | External entry point |
| Engine | 8000 | Internal (via nginx /api) |
| Worker Health | 8001 | Docker healthcheck |
| Gateway | 8200 | Internal (via nginx /gateway) |
| PostgreSQL | 5432 | Internal |
| Redis | 6379 | Internal |
| Qdrant | 6333 | Internal |
| MinIO | 9000, 9001 | Internal (S3 + console) |
| Ollama | 11434 | Internal |
| Platform | 3000 | Internal (via nginx) |
| Chat (dev) | 3002 | Dev only |
| Ops (dev) | 3003 | Dev only |
| Grafana | 3333 | Optional |
| Prometheus | 9090 | Optional |
