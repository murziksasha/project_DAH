#!/usr/bin/env sh
# Restore DAH from backup directory
# Usage: ./infra/scripts/restore.sh backups/20260625_120000
set -eu

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_directory>"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="$(cd "$1" && pwd)"

POSTGRES_USER="${POSTGRES_USER:-dah}"
POSTGRES_DB="${POSTGRES_DB:-dah}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-dah_minio}"
S3_SECRET_KEY="${S3_SECRET_KEY:-dah_minio_secret_change_me}"
S3_BUCKET="${S3_BUCKET:-dah-files}"

if [ ! -f "$BACKUP_DIR/database.sql.gz" ]; then
  echo "ERROR: $BACKUP_DIR/database.sql.gz not found"
  exit 1
fi

echo "==> Restoring database from $BACKUP_DIR"
gunzip -c "$BACKUP_DIR/database.sql.gz" | \
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction

if [ -d "$BACKUP_DIR/files" ]; then
  echo "==> Restoring MinIO files"
  docker compose -f "$ROOT/docker-compose.yml" run --rm \
    -v "$BACKUP_DIR/files:/backup" \
    --entrypoint sh minio-init -c "
      mc alias set local http://minio:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
      mc mirror --overwrite /backup local/$S3_BUCKET
    "
fi

echo "==> Restore complete"