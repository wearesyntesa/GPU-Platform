#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SWARM_STATE="$(docker info --format '{{.Swarm.LocalNodeState}}')"
SWARM_MANAGER="$(docker info --format '{{.Swarm.ControlAvailable}}')"

if [[ "$SWARM_STATE" != "active" ]]; then
  docker swarm init
elif [[ "$SWARM_MANAGER" != "true" ]]; then
  cat >&2 <<'EOF'
Docker is already joined to a Swarm as a worker. Local development needs this
machine to be a single-node Swarm manager.

If this machine is no longer part of a shared Swarm, run:
  docker swarm leave
  pnpm dev:setup

If it is still part of a shared Swarm, use a different machine or Docker context
for local development.
EOF
  exit 1
fi

NODE_ID="$(docker node ls -q | head -n1)"
VRAM_GB=""
CPU_TOTAL=""
MEMORY_TOTAL_GB=""
if command -v nvidia-smi >/dev/null 2>&1; then
  VRAM_MB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n1 | tr -d ' ')"
  if [[ "${VRAM_MB}" =~ ^[0-9]+$ ]]; then
    VRAM_GB="$(( (VRAM_MB + 1023) / 1024 ))"
  fi
fi
if command -v nproc >/dev/null 2>&1; then
  CPU_TOTAL="$(nproc)"
fi
if command -v free >/dev/null 2>&1; then
  MEMORY_TOTAL_GB="$(free -g | awk '/^Mem:/ { print $2 }')"
fi

docker node update \
  --label-add rpl.gpu=true \
  --label-add rpl.station=local-station \
  --label-add rpl.gpu_type=local-gpu \
  --label-add rpl.gpu_count=1 \
  "$NODE_ID"

if [[ -n "${VRAM_GB}" ]]; then
  docker node update --label-add "rpl.vram_gb=${VRAM_GB}" "$NODE_ID"
fi
if [[ -n "${CPU_TOTAL}" ]]; then
  docker node update --label-add "rpl.cpu_total=${CPU_TOTAL}" "$NODE_ID"
fi
if [[ -n "${MEMORY_TOTAL_GB}" ]]; then
  docker node update --label-add "rpl.memory_total_gb=${MEMORY_TOTAL_GB}" "$NODE_ID"
fi

docker build -t rpl/jupyter-local:dev infra/images/jupyter-local
CADDY_UID="$(id -u)" CADDY_GID="$(id -g)" docker compose --env-file .env -f infra/dev/docker-compose.yml up -d postgres caddy

until docker compose --env-file .env -f infra/dev/docker-compose.yml exec -T postgres pg_isready -U rpl -d rpl_gpu >/dev/null 2>&1; do
  sleep 1
done

printf '\nLocal Swarm ready. Next:\n  cp .env.example .env\n  pnpm install\n  pnpm db:migrate\n  pnpm dev\n\nOpen app through Caddy:\n  http://localhost:18080\n\nDirect Nest debug endpoint:\n  http://localhost:3000\n'
