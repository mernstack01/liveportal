# LivePortal API (NestJS + Prisma + grammY bot). Kontekst: repo ildizi.
# Ishga tushganda: migration → seed (idempotent) → server.
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app

# Avval faqat manifestlar: kod o'zgarsa, paketlar keshdan olinadi.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Hamma paketlar (dev ham): migration va CLI skriptlar (invite:create, seed) tsx bilan ishlaydi.
RUN pnpm install --frozen-lockfile --filter @liveportal/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
# prisma.config.ts DATABASE_URL so'raydi; generate bazaga ulanmaydi, shuning uchun soxta qiymat yetarli.
RUN pnpm --filter @liveportal/shared build \
  && cd apps/api && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate \
  && pnpm exec nest build

ENV NODE_ENV=production PORT=4100
WORKDIR /app/apps/api
EXPOSE 4100
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts && exec node dist/main"]
