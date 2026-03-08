FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY platform/package.json ./platform/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter @modularmind/platform...

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/platform/node_modules ./platform/node_modules
COPY --from=deps /app/packages/ ./packages/
COPY platform/ ./platform/
RUN cd platform && npx prisma generate && pnpm build

FROM base AS debug
WORKDIR /app
COPY --from=builder /app/platform/.next/standalone ./
RUN find . -name "server.js" -type f && echo "---" && ls -la
