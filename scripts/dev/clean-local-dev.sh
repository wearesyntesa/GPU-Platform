#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

docker compose --env-file .env -f infra/dev/docker-compose.yml down --volumes --remove-orphans

SWARM_STATE="$(docker info --format '{{.Swarm.LocalNodeState}}')"
SWARM_MANAGER="$(docker info --format '{{.Swarm.ControlAvailable}}')"

if [[ "$SWARM_STATE" == "active" && "$SWARM_MANAGER" == "true" ]]; then
  mapfile -t services < <(docker service ls -q --filter label=rpl.gpu-platform=true)
  if [[ "${#services[@]}" -gt 0 ]]; then
    docker service rm "${services[@]}"
  fi

  mapfile -t volumes < <(docker volume ls -q --filter label=rpl.gpu-platform=true)
  if [[ "${#volumes[@]}" -gt 0 ]]; then
    docker volume rm "${volumes[@]}"
  fi

  docker swarm leave --force
elif [[ "$SWARM_STATE" == "active" ]]; then
  docker swarm leave
fi

if [[ "${REMOVE_DEV_IMAGE:-0}" == "1" ]]; then
  docker image rm rpl/jupyter-local:dev >/dev/null 2>&1 || true
fi

printf '\nLocal dev environment cleaned. Run pnpm dev:setup to recreate it.\n'
