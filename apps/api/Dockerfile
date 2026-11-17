# Image de production de l'API GPR (à construire depuis la racine du dépôt) :
#   docker build -f apps/api/Dockerfile -t gpr-api .
# Image de base surchargeable (miroir) : --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/connectors/package.json packages/connectors/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter "@gpr/api..."
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @gpr/core build && pnpm --filter @gpr/connectors build && pnpm --filter @gpr/api build
# Dépendances de production uniquement, paquets internes inclus
RUN pnpm deploy --legacy --filter @gpr/api --prod /out && cd /out && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations : docker compose run --rm api npx prisma migrate deploy
CMD ["node", "dist/main.js"]
