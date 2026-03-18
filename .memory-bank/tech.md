# Tech Reference — ModularMind V2

## Package Manager & Tooling

- **pnpm 10.31.0** — enforced via `packageManager` field
- **Turbo 2.3** — build orchestration, caching (build/lint cached, dev persistent)
- **Workspaces**: `apps/*`, `packages/*`, `platform`
- **Python**: 3.12+, venv per service (`engine/server/.venv`, `gateway/.venv`)
- **Ruff**: linter for all Python (rules: E, F, I, UP, B, SIM — line-length 100)

## Essential Commands

```bash
# Dev
make dev-infra          # Start DB, Redis, Qdrant, MinIO, Ollama
make dev-engine         # uvicorn --reload :8000
make dev-worker         # Redis streams + scheduler
make dev-gateway        # uvicorn --reload :8200
make dev-chat           # Vite :3002
make dev-ops            # Vite :3003
make dev-platform       # Next.js :3000

# Build
make build              # All TS apps via turbo
make build-docker       # Client Docker images
make build-platform     # Platform Docker image

# Deploy
make deploy             # Client stack (docker compose up -d)
make deploy-platform    # Platform stack

# DB
make migrate            # Alembic upgrade head (engine)
make migrate-new        # Alembic auto-generate revision
make db-push            # Prisma db push (platform)
make db-studio          # Prisma studio

# Quality
make test               # pytest (shared + engine)
make test-cov           # pytest with coverage
make lint               # ruff + turbo lint
make lint-fix           # auto-fix
pnpm test               # vitest (TS)
pnpm test:coverage      # vitest with v8 coverage
```

## Key Dependencies & Versions

### TypeScript
| Package | Version | Used In |
|---------|---------|---------|
| React | 19 | all TS apps |
| React Router | 7 | chat, ops |
| Next.js | 16 | platform |
| Vite | 6 | chat, ops |
| Tailwind CSS | 4 | all TS apps |
| Zustand | 5 | chat, ops, ui |
| next-auth | 5.0.0-beta.30 | platform |
| Prisma | 6 | platform |
| vitest | 4 | root |
| Recharts | latest | ops |
| @xyflow/react | latest | ops (graph editor) |
| Graphology + Sigma | latest | ops (graph viz) |

### Python
| Package | Version | Used In |
|---------|---------|---------|
| FastAPI | 0.115+ | engine, gateway |
| SQLAlchemy | 2.0+ (asyncio) | engine, gateway |
| asyncpg | latest | engine, gateway |
| Alembic | 1.14+ | engine |
| LangGraph | 0.2+ | engine |
| LangChain | latest | engine (ollama, openai, anthropic) |
| Pydantic | 2.10+ | all Python |
| Redis (py) | 5.2+ | engine, gateway |
| Qdrant | 1.13+ | engine |
| APScheduler | 3.10+ | engine worker |
| MCP | 1.26+ | engine |
| Docker SDK | latest | engine (MCP), gateway (sandbox) |

## Environment Variables

### Engine (.env.example at root)
- `SECRET_KEY` — JWT signing (required)
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL`, `QDRANT_URL`, `OLLAMA_BASE_URL`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional)
- `PLATFORM_URL`, `ENGINE_API_KEY` (optional, for platform sync)
- `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`

### Platform (platform/.env.example)
- `DATABASE_URL` — separate PostgreSQL
- `AUTH_SECRET` — next-auth signing
- `ENGINE_URL`, `ENGINE_API_KEY`
- `GHCR_READ_TOKEN` — for client installer image pulls

### Docker (docker/.env.client.example)
- `COMPOSE_PROFILES` — ollama, gpu, storage, monitoring
- `MM_VERSION`, `DOMAIN`, `PROXY_PORT`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

## Gotchas & Workarounds

- **Tailwind v4**: No `tailwind.config.js`. Colors mapped via `@theme` blocks in each app's global CSS importing `theme.css`
- **`"use client"`**: Required on ALL `packages/ui` components that use hooks (harmless in Vite, required for Next.js SSR)
- **Gateway single worker**: MUST use `--workers 1` — sandbox state and approval workflow require single-process consistency
- **Engine Dockerfile builds SPAs**: The engine Docker image runs a multi-stage build that compiles chat + ops SPAs and bakes them into nginx
- **Ops base path**: `/ops` — configured in both `vite.config.ts` (`base: "/ops"`) and React Router (`basename="/ops"`)
- **Platform transpiles UI**: `next.config.ts` has `transpilePackages: ["@modularmind/ui"]` and `turbopack.root: ".."`
- **Python imports**: Always `from src.xxx` (engine/gateway), never relative. Always `from modularmind_shared.xxx`, never `from shared.`
- **Model IDs**: `provider:model` format everywhere (e.g., `ollama:llama3.2`, `openai:gpt-4o`)
- **No force-push to main**
- **Turbo global deps**: `.env.*local` files trigger full rebuilds
