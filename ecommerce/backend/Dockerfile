# SC-1 PROOF: built from the repo root (Dokploy Docker Context Path ".").
ARG NODE_VERSION=22
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
ARG MEDUSA_BACKEND_URL=""
ENV MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL}
ARG UPLOAD_MAX_FILE_SIZE_CEILING_MB=""
ENV UPLOAD_MAX_FILE_SIZE_CEILING_MB=${UPLOAD_MAX_FILE_SIZE_CEILING_MB}

# Workspace manifests first, for the install cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/medusa-core/package.json packages/medusa-core/pnpm-lock.yaml packages/medusa-core/
COPY ecommerce/backend/package.json ecommerce/backend/pnpm-lock.yaml ecommerce/backend/
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile

# Sources: only the core and this app.
COPY packages/medusa-core packages/medusa-core
COPY ecommerce/backend ecommerce/backend
RUN pnpm --filter @medusa-platform/medusa-core build \
 && pnpm --filter ecommerce-backend build

# Production install that resolves workspace and catalog dependencies
# (pnpm deploy, pnpm >= 12.2), then the built server next to it.
RUN pnpm --filter ecommerce-backend --prod deploy /prod \
 && mkdir /out \
 && cp -R /prod/node_modules /out/node_modules \
 && cp -R ecommerce/backend/.medusa/server/. /out/

FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=9000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node ecommerce/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
