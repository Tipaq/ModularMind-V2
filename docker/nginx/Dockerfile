# =============================================================================
# Nginx with Chat + Ops static files baked in
# =============================================================================
# Multi-stage: builds both Vite SPAs, then copies dist into nginx

FROM node:22-alpine AS base
RUN corepack enable

# --- Install dependencies ---
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json turbo.json ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/chat/package.json ./apps/chat/
COPY apps/ops/package.json ./apps/ops/
RUN pnpm install --frozen-lockfile

# --- Build Chat + Ops ---
FROM deps AS builder
WORKDIR /app
COPY packages/ ./packages/
COPY apps/chat/ ./apps/chat/
COPY apps/ops/ ./apps/ops/
RUN pnpm --filter @modularmind/chat build && pnpm --filter @modularmind/ops build

# --- Final nginx ---
FROM nginx:alpine
COPY --from=builder /app/apps/chat/dist /usr/share/nginx/html/chat
COPY --from=builder /app/apps/ops/dist /usr/share/nginx/html/ops
# Config is mounted via docker-compose volume
EXPOSE 80
