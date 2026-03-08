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
COPY package.json pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/platform/node_modules ./platform/node_modules
COPY --from=deps /app/packages/ ./packages/
COPY platform/ ./platform/
RUN cd platform && npx prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./.next/static
COPY --from=builder /app/platform/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
