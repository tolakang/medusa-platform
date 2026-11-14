# =====================================================================
# reseller / seller-portal — Next.js (seller portal)
#
# Dokploy: Build Type = Dockerfile, Build Path = /,
#   Docker File = reseller/seller-portal/Dockerfile,
#   Docker Context Path = . (repo root),
#   Watch Paths = reseller/seller-portal/**, pnpm-workspace.yaml, package.json, pnpm-lock.yaml  (BUILD_PLAN.md §5.3)
#   Environment -> Build-time Arguments: the ARG values below
#   Environment -> Runtime variables   : see .env.example
#   Domain -> port 3000
#
# NEXT_PUBLIC_* values are baked into the JS bundle at build time, so
# changing one requires a rebuild (Dokploy: Rebuild).
#
# STATUS: app code added (TASKS P5-08). next.config.js sets
# `output: "standalone"`; the build needs no backend and no build args (the
# NEXT_PUBLIC_* values below are only a fallback for MEDUSA_BACKEND_URL).
# =====================================================================
ARG NODE_VERSION=22

# ---------- build ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

# ---- build-time arguments (set in Dokploy "Build-time Arguments") ----
# Public backend URL the browser calls, e.g. https://api.example.com
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=""
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL}
# This app's public URL
ARG NEXT_PUBLIC_BASE_URL=""
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

# Workspace manifests first (root pnpm workspace, Medusa catalog; BUILD_PLAN.md
# §4.3). Exact pnpm version from the root package.json "packageManager".
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY reseller/seller-portal/package.json reseller/seller-portal/pnpm-lock.yaml reseller/seller-portal/
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile --filter reseller-seller-portal

COPY reseller/seller-portal reseller/seller-portal
WORKDIR /repo/reseller/seller-portal
RUN pnpm build

# ---------- runtime ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /repo/reseller/seller-portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/reseller/seller-portal/.next/static ./.next/static
COPY --from=build --chown=node:node /repo/reseller/seller-portal/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
