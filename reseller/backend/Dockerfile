# =====================================================================
# reseller / backend — Medusa server + worker (same image, two Dokploy apps)
#
# Dokploy: Build Type = Dockerfile, Build Path = /,
#   Docker File = reseller/backend/Dockerfile, Docker Context Path = . (repo root),
#   Watch Paths = reseller/backend/**, pnpm-workspace.yaml, package.json, pnpm-lock.yaml
#   (BUILD_PLAN.md §5.3, §8.1; F-011)
#   server app : MEDUSA_WORKER_MODE=server   (domain -> port 9000)
#   worker app : MEDUSA_WORKER_MODE=worker, DISABLE_MEDUSA_ADMIN=true,
#                RUN_MIGRATIONS=false        (no domain)
#
# Base images are fully qualified for Podman/Buildah (BUILD_PLAN.md §7.1).
# =====================================================================
ARG NODE_VERSION=22

# ---------- build ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo

# Optional: absolute backend URL baked into the admin dashboard.
# Leave empty when the admin is served by this same app (recommended).
ARG MEDUSA_BACKEND_URL=""
ENV MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL}
# Optional: upload ceiling in MB baked into the admin's own file-size check
# (admin.maxUploadFileSize is build-time). Empty = 5. Keep it equal to the
# runtime UPLOAD_MAX_FILE_SIZE_CEILING_MB (TASKS P1-12, F-027).
ARG UPLOAD_MAX_FILE_SIZE_CEILING_MB=""
ENV UPLOAD_MAX_FILE_SIZE_CEILING_MB=${UPLOAD_MAX_FILE_SIZE_CEILING_MB}

# Workspace manifests first, for the install cache. Exact pnpm version from
# the root package.json "packageManager".
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY reseller/backend/package.json reseller/backend/pnpm-lock.yaml reseller/backend/
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile --filter reseller-backend

COPY reseller/backend reseller/backend
RUN pnpm --filter reseller-backend build

# Production install: `medusa build` copies package.json as is, so its
# "catalog:" versions can't be installed inside .medusa/server. pnpm deploy
# (pnpm >= 12.2) resolves them into a portable node_modules (SC-1 proof).
RUN pnpm --filter reseller-backend --prod deploy /prod \
 && mkdir /out \
 && cp -R /prod/node_modules /out/node_modules \
 && cp -R reseller/backend/.medusa/server/. /out/

# ---------- runtime ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=9000
WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --chown=node:node reseller/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
