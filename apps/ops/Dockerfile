FROM node:22-alpine AS base
RUN corepack enable

# Prune monorepo for ops app only
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
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

# Run with Next.js standalone output
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/ops/.next/standalone ./
COPY --from=builder /app/apps/ops/.next/static ./.next/static
COPY --from=builder /app/apps/ops/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
