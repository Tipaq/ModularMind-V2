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

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
# Next.js standalone output
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./platform/.next/static
COPY --from=builder /app/platform/public ./platform/public
# Full node_modules from builder (overwrites standalone's minimal copy)
COPY --from=builder /app/node_modules ./node_modules
# Prisma schema
COPY --from=builder /app/platform/prisma ./platform/prisma
# Entrypoint
COPY platform/docker-entrypoint.sh ./platform/
RUN chmod +x ./platform/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./platform/docker-entrypoint.sh"]
CMD ["node", "platform/server.js"]
