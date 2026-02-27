FROM node:22-alpine AS base
RUN corepack enable

# Prune monorepo for chat app only
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @modularmind/chat --docker

# Install dependencies
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Build
FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@modularmind/chat

# Output: static files (mounted into client nginx via docker-compose volume)
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/chat/dist /usr/share/nginx/html
EXPOSE 80
