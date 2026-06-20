# Deployment Guide

## Overview

RPL GPU Platform uses Docker Swarm with automated migration orchestration. Database migrations run as a one-off service before app updates, eliminating manual SSH steps while maintaining safety.

## Prerequisites

1. **Build and push the image**:

```bash
export APP_VERSION=$(date +%Y-%m-%d-%H%M)
export APP_REVISION=$(git rev-parse --short HEAD)

docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg APP_REVISION="$APP_REVISION" \
  --build-arg APP_BUILD_TIME="$(date -Iseconds)" \
  -t registry.example/rpl-gpu-platform:"$APP_VERSION" \
  .

docker push registry.example/rpl-gpu-platform:"$APP_VERSION"
```

2. **Set deployment environment variables**:

```bash
export RPL_GPU_PLATFORM_IMAGE=registry.example/rpl-gpu-platform:$APP_VERSION
export APP_URL=http://192.168.11.76
export CADDY_PUBLIC_URL=http://192.168.11.76
export CADDY_APP_UPSTREAM=app:3000
export SESSION_SECRET="your-secret-here"
export POSTGRES_PASSWORD=your-password
export DATABASE_URL=postgres://rpl:your-password@postgres:5432/rpl_gpu
```

## Deployment Steps

### 1. Run Database Migration

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

### 2. Update Application

Once migration succeeds, update the app service:

```bash
docker service update \
  --image registry.example/rpl-gpu-platform:$APP_VERSION \
  --env-add APP_VERSION=$APP_VERSION \
  --env-add APP_REVISION=$APP_REVISION \
  rpl-gpu_app
```

Swarm will:
- Stop the old container (stop-first)
- Start the new container
- Run health checks (`/readyz` must pass)
- Automatically rollback if health checks fail

### 3. Cleanup Migration Service

Scale migration service back to 0:

```bash
docker service scale rpl-gpu_migrations=0
```

### 4. Verify Deployment

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

1. **Restore database from backup** (taken before step 1)
2. **Rollback app** to previous version
3. **Do not run new migrations** until issues are resolved

**Best practice**: Take a database backup before every deployment:

```bash
# Before step 1
docker exec $(docker ps -q -f name=rpl-gpu_postgres) \
  pg_dump -U rpl rpl_gpu > backup-$(date +%Y%m%d-%H%M%S).sql
```

## Full Deployment Script

Combine all steps:

```bash
#!/bin/bash
set -e

APP_VERSION=$(date +%Y-%m-%d-%H%M)
APP_REVISION=$(git rev-parse --short HEAD)

echo "Building image: $APP_VERSION"
docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg APP_REVISION="$APP_REVISION" \
  --build-arg APP_BUILD_TIME="$(date -Iseconds)" \
  -t registry.example/rpl-gpu-platform:"$APP_VERSION" \
  .

echo "Pushing image"
docker push registry.example/rpl-gpu-platform:"$APP_VERSION"

echo "Backing up database"
docker exec $(docker ps -q -f name=rpl-gpu_postgres) \
  pg_dump -U rpl rpl_gpu > backup-$(date +%Y%m%d-%H%M%S).sql

echo "Running migrations"
docker service scale rpl-gpu_migrations=1
echo "Waiting for migration to complete (check logs in another terminal)"
read -p "Press Enter when migration is complete..."

echo "Updating app"
docker service update \
  --image registry.example/rpl-gpu-platform:$APP_VERSION \
  --env-add APP_VERSION=$APP_VERSION \
  --env-add APP_REVISION=$APP_REVISION \
  rpl-gpu_app

echo "Cleaning up migration service"
docker service scale rpl-gpu_migrations=0

echo "Verifying deployment"
curl -s http://192.168.11.76/version | jq
curl -s http://192.168.11.76/readyz | jq

echo "Deployment complete: $APP_VERSION"
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
  registry.example/rpl-gpu-platform:$APP_VERSION \
  /app/scripts/migrate.sh
```

## See Also

- [PRODUCTION_SWARM.md](docs/PRODUCTION_SWARM.md) - Swarm setup and configuration
- [README.md](README.md) - Local development setup
