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
# Collect only the Prisma files needed at runtime (CLI + query engine)
RUN mkdir -p /prisma-runtime && \
    cp -r /app/platform/prisma /prisma-runtime/prisma && \
    # Prisma CLI
    cp -r /app/node_modules/.pnpm/prisma@*/node_modules/prisma /prisma-runtime/prisma-cli && \
    # Prisma internals
    cp -r /app/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines /prisma-runtime/engines && \
    # Query engine for runtime
    cp -r /app/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client /prisma-runtime/client

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
# Next.js standalone output
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./platform/.next/static
COPY --from=builder /app/platform/public ./platform/public
# Prisma: schema + CLI + engine (minimal footprint for db push)
COPY --from=builder /prisma-runtime/prisma ./platform/prisma
COPY --from=builder /prisma-runtime/prisma-cli ./node_modules/prisma
COPY --from=builder /prisma-runtime/engines ./node_modules/@prisma/engines
COPY --from=builder /prisma-runtime/client ./node_modules/@prisma/client
# Entrypoint
COPY platform/docker-entrypoint.sh ./platform/
RUN chmod +x ./platform/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./platform/docker-entrypoint.sh"]
CMD ["node", "platform/server.js"]
