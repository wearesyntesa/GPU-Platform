#!/bin/bash
set -e

echo "Starting database migration..."
cd /app

SEMAPHORE_PATH="${MIGRATION_SEMAPHORE_PATH:-/run/rpl-gpu/migration-complete}"

rm -f "$SEMAPHORE_PATH"
pnpm db:migrate

mkdir -p "$(dirname "$SEMAPHORE_PATH")"
touch "$SEMAPHORE_PATH"

echo "Migration completed successfully"
