#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 7 ]; then
  echo "usage: $0 NODE_NAME STATION GPU_TYPE GPU_COUNT [VRAM_GB] [CPU_TOTAL] [MEMORY_TOTAL_GB]" >&2
  exit 1
fi

node_name="$1"
station="$2"
gpu_type="$3"
gpu_count="$4"
vram_gb="${5:-}"
cpu_total="${6:-}"
memory_total_gb="${7:-}"

docker node update \
  --label-add rpl.gpu=true \
  --label-add "rpl.station=${station}" \
  --label-add "rpl.gpu_type=${gpu_type}" \
  --label-add "rpl.gpu_count=${gpu_count}" \
  "$node_name"

if [ -n "$vram_gb" ]; then
  docker node update --label-add "rpl.vram_gb=${vram_gb}" "$node_name"
fi

if [ -n "$cpu_total" ]; then
  docker node update --label-add "rpl.cpu_total=${cpu_total}" "$node_name"
fi

if [ -n "$memory_total_gb" ]; then
  docker node update --label-add "rpl.memory_total_gb=${memory_total_gb}" "$node_name"
fi
