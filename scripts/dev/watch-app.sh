#!/usr/bin/env bash
set -euo pipefail

pnpm build:styles

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

pnpm watch:styles &
styles_pid=$!

cleanup() {
  kill "$styles_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

NODE_OPTIONS='--max-old-space-size=512' exec pnpm nest:start:watch
