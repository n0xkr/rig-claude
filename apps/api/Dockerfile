# ============================================================================
# Rigabras API - Dockerfile multi-stage (Alpine, sem devDependencies em prod)
# ============================================================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ---- deps: instala dependências de todo o monorepo com cache de camadas ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# ---- build: compila shared e api ----
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @rigabras/shared run build
RUN pnpm --filter @rigabras/api run build

# ---- runtime: apenas artefatos de produção ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
RUN addgroup -S rigabras && adduser -S rigabras -G rigabras

COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY pnpm-workspace.yaml package.json ./

RUN pnpm install --prod --frozen-lockfile --filter @rigabras/api... || pnpm install --prod

USER rigabras
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/healthz || exit 1

CMD ["node", "apps/api/dist/server.js"]
