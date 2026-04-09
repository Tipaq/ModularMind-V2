FROM node:22-alpine AS base
RUN corepack enable && npm install -g turbo

# Prune monorepo for ops app only
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @modularmind/ops --docker

# Install dependencies
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Build
FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@modularmind/ops

# Serve static files with nginx
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/ops/dist /usr/share/nginx/html
EXPOSE 80
