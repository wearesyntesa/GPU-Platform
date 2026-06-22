FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm config set fetch-timeout 300000 \
  && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ARG APP_VERSION=local
ARG APP_REVISION=unknown
ARG APP_BUILD_TIME=unknown

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates docker.io \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.2 --activate

ENV NODE_ENV=production \
  PORT=3000 \
  APP_VERSION=$APP_VERSION \
  APP_REVISION=$APP_REVISION \
  APP_BUILD_TIME=$APP_BUILD_TIME

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/migrate.sh ./scripts/migrate.sh
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/infrastructure/db/migrations ./src/infrastructure/db/migrations
COPY --from=build /app/src/infrastructure/db/schema.ts ./src/infrastructure/db/schema.ts
COPY --from=build /app/infra/images/jupyter-local ./infra/images/jupyter-local

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "-r", "module-alias/register", "dist/src/main.js"]
