# Deployment Guide

## Overview

RPL GPU Platform uses Docker Swarm with automated migration orchestration. Database migrations run as a one-off service before app updates, eliminating manual SSH steps while maintaining safety.

## Release Workflow

Releases use `pnpm version` + git tags. When a `vX.Y.Z` tag is pushed, GitHub Actions automatically:
- Builds Docker image
- Pushes to GHCR with version tags
- Creates GitHub Release with changelog

### Creating a Release

```bash
# 1. Make sure main is clean and up to date
git checkout main
git pull

# 2. Run quality gates locally
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# 3. Bump version (choose one):
pnpm version patch  # 0.3.0 -> 0.3.1 (bugfix)
pnpm version minor  # 0.3.0 -> 0.4.0 (feature)
pnpm version major  # 0.3.0 -> 1.0.0 (breaking)

# This creates:
# - Commit bumping package.json version
# - Git tag vX.Y.Z

# 4. Push commit and tag
git push && git push --tags

# 5. GitHub Actions will:
# - Build image: ghcr.io/wearesyntesa/gpu-platform:X.Y.Z
# - Tag aliases: X.Y, latest, sha-<short>
# - Create GitHub Release with auto-generated notes
```

### Available Image Tags

```text
ghcr.io/wearesyntesa/gpu-platform:0.3.0      # Specific version
ghcr.io/wearesyntesa/gpu-platform:0.3        # Latest 0.3.x
ghcr.io/wearesyntesa/gpu-platform:latest    # Latest stable
ghcr.io/wearesyntesa/gpu-platform:sha-abc123 # Commit-specific
```

### Emergency Manual Build

If CI fails, build and push manually:

```bash
export APP_VERSION=0.3.1
export APP_REVISION=$(git rev-parse HEAD)

docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg APP_REVISION="$APP_REVISION" \
  --build-arg APP_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t ghcr.io/wearesyntesa/gpu-platform:"$APP_VERSION" \
  .

docker push ghcr.io/wearesyntesa/gpu-platform:"$APP_VERSION"
```

## Prerequisites

1. Review the release notes and any Drizzle migrations in the release.
2. Create and verify a database backup using the standard command below.
3. Confirm the production security checklist below.
4. Set deployment environment variables:

```bash
export APP_VERSION=1.2.3
export APP_REVISION=<release-git-sha>
export RPL_GPU_PLATFORM_IMAGE=ghcr.io/wearesyntesa/gpu-platform:$APP_VERSION
export APP_URL=https://gpu.example.org
export CADDY_PUBLIC_URL=https://gpu.example.org
export CADDY_APP_UPSTREAM=app:3000
export TRUST_PROXY=1
export SESSION_SECRET="your-secret-here"
export POSTGRES_PASSWORD=your-password
export DATABASE_URL=postgres://rpl:your-password@postgres:5432/rpl_gpu
```

## Production Security Checklist

- Run production behind HTTPS and set `APP_URL` / `CADDY_PUBLIC_URL` to the HTTPS origin.
- Set `TRUST_PROXY=1` only when Caddy is the direct proxy to the Nest app.
- Keep `SESSION_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, and registry credentials out of git, docs, logs, and shell history; prefer Swarm secrets or an external secret store.
- Generate `SESSION_SECRET` with `openssl rand -base64 48`; production rejects secrets shorter than 32 characters.
- Keep Caddy admin API private to the Swarm/app network, never public Internet.
- Ensure users reach Jupyter only through Caddy workspace routes; raw workspace published ports must be blocked from untrusted networks.
- Keep workspace containers without Docker socket, privileged mode, broad host mounts, or host network access; only `/work` should be mounted.

The app adds security headers, disables `X-Powered-By`, injects CSRF tokens into
server-rendered POST forms, and rate-limits login/register POSTs. `TRUST_PROXY`
must match the proxy topology so secure cookies and rate-limit client IPs work
correctly.

## Deployment Steps

### 1. Back Up Database

Take a plain SQL backup before every production deployment. Store it outside the
container host after creation.

```bash
mkdir -p backups
BACKUP_FILE="backups/rpl_gpu-before-${APP_VERSION}-$(date +%Y%m%d-%H%M%S).sql"

docker exec $(docker ps -q -f name=rpl-gpu_postgres) \
  pg_dump --clean --if-exists -U rpl rpl_gpu > "$BACKUP_FILE"

test -s "$BACKUP_FILE"
grep -q "PostgreSQL database dump complete" "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

`--clean --if-exists` makes restore replace objects from the backup instead of
layering old and new schema objects together. Do not continue deployment if the
backup file is empty or missing the completion marker.

### 2. Run Database Migration

Scale the migration service to 1 replica. It will run migrations and exit:

```bash
docker service scale rpl-gpu_migrations=1
```

Watch migration logs:

```bash
docker service logs -f rpl-gpu_migrations
```

Wait for this log line:
```
Migration completed successfully
```

The migration container exits after the command finishes. Docker Swarm services are designed for long-running tasks, so `docker service scale` may report early termination even when migration succeeded. Trust the log line above and `/readyz` after the app update.

### 3. Update Application

Once migration succeeds, update the app service:

```bash
docker service update \
  --image ghcr.io/wearesyntesa/gpu-platform:$APP_VERSION \
  --env-add APP_VERSION=$APP_VERSION \
  --env-add APP_REVISION=$APP_REVISION \
  rpl-gpu_app
```

Swarm will:
- Stop the old container (stop-first)
- Start the new container
- Run health checks (`/readyz` must pass)
- Automatically rollback if health checks fail

### 4. Cleanup Migration Service

Scale migration service back to 0:

```bash
docker service scale rpl-gpu_migrations=0
```

### 5. Verify Deployment

Check app version and health:

```bash
curl http://192.168.11.76/version
curl http://192.168.11.76/readyz
```

Expected output:
```json
{"status":"ok","checks":{"migrations":{"ok":true},"db":{"ok":true},"caddy":{"ok":true},"docker":{"ok":true}}}
```

## Rollback

### Application Rollback

If the app update fails health checks, Swarm automatically rolls back. Manual rollback:

```bash
docker service rollback rpl-gpu_app
```

### Migration Rollback

Drizzle migrations are forward-only. For rollback:

1. **Stop app writes** by scaling the app to 0 or blocking user access.
2. **Restore database from backup** taken before the migration.
3. **Rollback app** to previous version.
4. **Do not run new migrations** until issues are resolved.

Restore is destructive. Confirm `BACKUP_FILE` points to the intended backup
before running it:

```bash
BACKUP_FILE=backups/rpl_gpu-before-1.2.3-YYYYMMDD-HHMMSS.sql

test -s "$BACKUP_FILE"
grep -q "PostgreSQL database dump complete" "$BACKUP_FILE"

docker service scale rpl-gpu_app=0

docker exec -i $(docker ps -q -f name=rpl-gpu_postgres) \
  psql -v ON_ERROR_STOP=1 -U rpl -d rpl_gpu < "$BACKUP_FILE"

docker service rollback rpl-gpu_app
docker service scale rpl-gpu_app=1

curl -s http://192.168.11.76/readyz | jq
```

If the app cannot safely run against the restored schema, keep `rpl-gpu_app` at
0 until the previous image is confirmed or a forward-fix image is deployed.

### Restore Drill

Before relying on this process for production, test restore on a non-production
database:

1. Create a backup with the standard command.
2. Restore it into an isolated Postgres database or throwaway Swarm stack.
3. Run migrations against the restored database.
4. Start the app against the restored database.
5. Verify `/readyz`, login, admin pages, and workspace request listing.

Record the backup filename, restore date, operator, and verification result in
the deployment notes.

## Manual Deployment Checklist

Use this checklist rather than a blind one-shot script. Stop if any step fails.

```bash
APP_VERSION=1.2.3
APP_REVISION=<release-git-sha>
mkdir -p backups
BACKUP_FILE="backups/rpl_gpu-before-${APP_VERSION}-$(date +%Y%m%d-%H%M%S).sql"

docker exec $(docker ps -q -f name=rpl-gpu_postgres) \
  pg_dump --clean --if-exists -U rpl rpl_gpu > "$BACKUP_FILE"

test -s "$BACKUP_FILE"
grep -q "PostgreSQL database dump complete" "$BACKUP_FILE"

docker service scale rpl-gpu_migrations=1
docker service logs -f rpl-gpu_migrations

docker service update \
  --image ghcr.io/wearesyntesa/gpu-platform:$APP_VERSION \
  --env-add APP_VERSION=$APP_VERSION \
  --env-add APP_REVISION=$APP_REVISION \
  rpl-gpu_app

docker service scale rpl-gpu_migrations=0

curl -s http://192.168.11.76/version | jq
curl -s http://192.168.11.76/readyz | jq
```

## Breaking Schema Changes

For breaking changes (dropping columns, renaming tables), use the **expand-contract pattern**:

### Phase 1: Expand
1. Add new column/table alongside old one
2. Deploy app version writing to BOTH old and new
3. Backfill data from old to new

### Phase 2: Contract
1. Deploy app version reading from new only
2. After stability period (24-48h), drop old column/table

This ensures zero-downtime even with breaking changes.

## Troubleshooting

### Migration service stuck in starting state

```bash
docker service ps rpl-gpu_migrations --no-trunc
docker service logs rpl-gpu_migrations
```

Common causes:
- Database connection string wrong
- Postgres service not ready
- Migration SQL syntax error

### App fails health check after update

```bash
docker service ps rpl-gpu_app
docker service logs rpl-gpu_app
```

Check:
- Migration semaphore file exists: `docker exec <container> ls -l /run/rpl-gpu/migration-complete`
- Database connection working
- Caddy/Docker socket accessible

### Manual migration run

If automation fails, run migration manually:

```bash
docker run --rm --network rpl-gpu_default \
  -e DATABASE_URL=postgres://rpl:password@postgres:5432/rpl_gpu \
  ghcr.io/wearesyntesa/gpu-platform:$APP_VERSION \
  /app/scripts/migrate.sh
```

## See Also

- [PRODUCTION_SWARM.md](docs/PRODUCTION_SWARM.md) - Swarm setup and configuration
- [README.md](README.md) - Local development setup
