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

# --- Migrate image: used by the migrate service to sync the DB schema ---
FROM base AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/platform/node_modules ./platform/node_modules
COPY platform/prisma ./platform/prisma
WORKDIR /app/platform
CMD ["npx", "prisma", "db", "push"]

# --- Runner image: lean, just Next.js standalone ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./platform/.next/static
COPY --from=builder /app/platform/public ./platform/public
EXPOSE 3000
CMD ["node", "platform/server.js"]
