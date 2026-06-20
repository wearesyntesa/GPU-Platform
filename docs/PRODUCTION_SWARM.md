# Production Swarm

## Node Labels

Every GPU station that joins Swarm must have these kind of labels:

```bash
docker node update \
  --label-add rpl.gpu=true \
  --label-add rpl.station=station03 \
  --label-add 'rpl.gpu_type=NVIDIA GeForce RTX 3050' \
  --label-add rpl.gpu_count=1 \
  --label-add rpl.vram_gb=8 \
  NODE_ID_OR_NAME
```

`rpl.vram_gb` is capacity inventory only. The platform displays it, but does not enforce VRAM limits.

## Discover GPU Facts On Each Station

Run on each station:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits
```

If memory prints in MB, round up to GB for `rpl.vram_gb`.

## Verify

After joining/labeling nodes:

```bash
docker node ls
RUN_LOCAL_E2E=1 pnpm test -- test/local-e2e.spec.ts
```

Then open `/admin/nodes` and confirm each node shows station, GPU type, count, VRAM, enabled, and maintenance state.

## App Runtime Limits

Run the Nest app as built JavaScript with production mode and a bounded V8 heap:

```bash
NODE_ENV=production \
NODE_OPTIONS="--max-old-space-size=256" \
DATABASE_POOL_MAX=5 \
SESSION_DATABASE_POOL_MAX=2 \
CADDY_ACCESS_LOG_PATH=/logs/access.json \
node -r module-alias/register dist/src/main.js
```

`DATABASE_POOL_MAX` limits application query connections. `SESSION_DATABASE_POOL_MAX` limits the separate session-store pool. Start with `256` MB heap; lower only after local E2E and production-like workspace tests pass.

`CADDY_ACCESS_LOG_PATH` must point to the JSON access log volume shared with Caddy. Workspace idle-stop uses this log to detect real Jupyter traffic under `/workspaces/<sessionId>/...`.

## Web App Image

GitHub Actions publishes release images to GHCR when release-please creates a
`vX.Y.Z` tag:

```text
ghcr.io/wearesyntesa/gpu-platform:X.Y.Z
ghcr.io/wearesyntesa/gpu-platform:X.Y
ghcr.io/wearesyntesa/gpu-platform:sha-<shortsha>
```

For emergency manual builds, use the same immutable version metadata:

```bash
export APP_VERSION=1.2.3
export APP_REVISION=$(git rev-parse --short HEAD)

docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg APP_REVISION="$APP_REVISION" \
  --build-arg APP_BUILD_TIME="$(date -Iseconds)" \
  -t ghcr.io/wearesyntesa/gpu-platform:"$APP_VERSION" \
  .
docker push ghcr.io/wearesyntesa/gpu-platform:"$APP_VERSION"
```

## Deployment

The web/control-plane service is intentionally singleton and master-only. If the
master is down, the UI is down; that is expected. Do not scale app replicas for
HA until Docker/Caddy side effects are split into a dedicated singleton worker.

Label the master once:

```bash
docker node update --label-add rpl.role=master station03.infra.labrpl.net
```

### Automated Migration Flow

The stack includes a `migrations` service that runs database migrations as a one-off job before app updates. This eliminates manual SSH steps while maintaining safety.

**See [DEPLOYMENT.md](../DEPLOYMENT.md) for the complete deployment process.**

Quick reference:

```bash
# 1. Run migrations
docker service scale rpl-gpu_migrations=1
docker service logs -f rpl-gpu_migrations  # Wait for "Migration completed successfully"

# 2. Update app
docker service update --image ghcr.io/wearesyntesa/gpu-platform:$APP_VERSION rpl-gpu_app

# 3. Cleanup
docker service scale rpl-gpu_migrations=0
```

The app's `/readyz` health check verifies `/run/rpl-gpu/migration-complete` from the shared `migration-state` volume. The migration task exits after success, so Swarm may mark the service update as early terminated; use the success log line as the migration result.

### Stack Configuration

The stack uses `replicas: 1`, `stop-first`, readiness healthcheck, and automatic
rollback on failed update. `stop-first` is intentional: the control plane is a
singleton and publishes a fixed port, so `start-first` would add duplicate
side-effect risks without meaningful HA.

### Rollback

Automatic rollback on health check failure, or manual:

```bash
docker service rollback rpl-gpu_app
```

### Verification

Check deployed version and readiness:

```bash
curl http://MASTER/version
curl http://MASTER/readyz
```

The `/readyz` endpoint checks migrations, database, Caddy, and Docker connectivity.
