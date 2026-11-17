# Image de production du back-office (à construire depuis la racine du dépôt) :
#   docker build -f apps/admin/Dockerfile -t gpr-admin .
# Image de base surchargeable (miroir) : --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter "@gpr/admin..."
COPY packages/core packages/core
COPY apps/admin apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @gpr/core build && pnpm --filter @gpr/admin build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3001/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/admin/server.js"]
