FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY platform/package.json ./
COPY packages/ /app/packages/
COPY pnpm-workspace.yaml pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY platform/ ./platform/
COPY packages/ ./packages/
RUN cd platform && npx prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./.next/static
COPY --from=builder /app/platform/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
