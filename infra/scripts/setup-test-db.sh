#!/usr/bin/env sh
# Create dah_test database and apply migrations
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
POSTGRES_USER="${POSTGRES_USER:-dah}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dah_secret_change_me}"
POSTGRES_DB="${POSTGRES_DB:-dah}"
TEST_DB="${TEST_DB:-dah_test}"

echo "==> Creating test database: $TEST_DB"
docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE $TEST_DB;" 2>/dev/null || true

export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB}"
cd "$ROOT/apps/api"
npx prisma migrate deploy
echo "==> Test DB ready: $DATABASE_URL"