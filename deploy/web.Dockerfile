# Web (Vite build) + Caddy: statik fayllar, /api → API, avtomatik HTTPS. Kontekst: repo ildizi.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @liveportal/web...
COPY apps/web apps/web
RUN pnpm --filter @liveportal/web build

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
