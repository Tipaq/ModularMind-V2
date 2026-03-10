# =============================================================================
# Engine Dockerfile — multi-stage build (shared + engine + SPAs)
# =============================================================================
# Used by both `engine` and `worker` services (same image, different CMD)
# BuildKit parallelizes `deps` and `spa-builder` stages automatically.

FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# --- Python dependencies ---
FROM base AS deps

# Install shared package first (rarely changes)
COPY shared/pyproject.toml /tmp/shared/pyproject.toml
COPY shared/src /tmp/shared/src
RUN pip install --no-cache-dir /tmp/shared/ && rm -rf /tmp/shared/

# Install engine dependencies (no dev deps in production)
COPY engine/server/pyproject.toml /tmp/engine/pyproject.toml
RUN cd /tmp/engine && pip install --no-cache-dir . && rm -rf /tmp/engine/

# --- SPA build (Chat + Ops) ---
FROM node:22-alpine AS spa-builder
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json turbo.json ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/chat/package.json ./apps/chat/
COPY apps/ops/package.json ./apps/ops/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/chat/ ./apps/chat/
COPY apps/ops/ ./apps/ops/
RUN pnpm --filter @modularmind/chat build && pnpm --filter @modularmind/ops build

# --- Runtime ---
FROM base AS runtime

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy engine source + Alembic
COPY engine/server/src ./src
COPY engine/server/seed ./seed
COPY engine/server/alembic.ini ./alembic.ini
COPY engine/server/alembic ./alembic

# Copy SPA builds
COPY --from=spa-builder /app/apps/chat/dist ./static/chat
COPY --from=spa-builder /app/apps/ops/dist ./static/ops

# Entrypoint: run migrations before starting
COPY engine/server/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

# Default: run engine server (worker overrides via docker-compose command)
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
