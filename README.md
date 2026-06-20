# RPL GPU Platform

Custom Jupyter-only GPU notebook platform for RPL lab.

## Stack

- NestJS modular monolith
- React server-rendered UI
- SCSS compiled to static CSS
- PostgreSQL
- Drizzle migrations
- Docker Swarm for notebook services
- Caddy for reverse proxy routes

## Local Development

Local development uses single-node Docker Swarm. `pnpm dev:setup` initializes
Swarm when Docker is inactive, labels the local node as a GPU worker, builds the
local Jupyter image, and starts Postgres/Caddy.

If Docker is already joined to another Swarm as a worker, leave that Swarm before
running local setup:

```bash
docker swarm leave
```

```bash
cp .env.example .env
pnpm install
pnpm dev:setup
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` runs NestJS watch mode and Sass watch mode together. Edit styles in
`assets/styles/app.scss`; Sass recompiles `public/app.css` automatically.

Open the app through Caddy:

```text
http://localhost:18080
```

Direct NestJS debug endpoint:

```text
http://localhost:3000
```

Caddy health check:

```text
http://localhost:18080/healthz
```

`pnpm dev` loads `.env`. If you change `PORT`, update `CADDY_APP_UPSTREAM` in
`.env` to match the NestJS port, for example
`CADDY_APP_UPSTREAM=host.docker.internal:3100`, then restart Caddy with
`pnpm dev:setup`.

Run the full local lifecycle check after Swarm, Caddy, Postgres, and the app are running:

```bash
RUN_LOCAL_E2E=1 pnpm test -- test/local-e2e.spec.ts
```

### Local Cleanup

Stop dev Postgres/Caddy but keep database data and local Swarm state:

```bash
pnpm dev:down
```

Reset dev Postgres/Caddy data while keeping local Swarm state:

```bash
pnpm dev:reset
pnpm dev:setup
pnpm db:migrate
pnpm db:seed
```

Remove local workspace services/volumes, reset Compose data, and leave the local
Swarm. Use this before turning the machine back into a Swarm worker or when you
want a fully clean local dev environment:

```bash
pnpm dev:clean
```

To also remove the local Jupyter dev image:

```bash
REMOVE_DEV_IMAGE=1 pnpm dev:clean
```

Temporary bootstrap users:

```text
admin / adminlabrpl
student01 / Student01Lab!
```

## Production Build

```bash
pnpm build
pnpm start
```

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the automated deployment process using Docker Swarm with migration orchestration.

See [docs/PRODUCTION_SWARM.md](docs/PRODUCTION_SWARM.md) for Swarm cluster setup and configuration.
