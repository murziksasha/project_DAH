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
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_BUCKET="${S3_BUCKET:-dah-files}"
ENC_PASS_FILE="${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}"
TMP_DIR=""
cleanup() { [ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# M17: encrypted backups (backup.sh with BACKUP_ENCRYPTION_PASSPHRASE_FILE)
if [ -f "$BACKUP_DIR/database.sql.gz.enc" ]; then
  if [ -z "$ENC_PASS_FILE" ] || [ ! -r "$ENC_PASS_FILE" ]; then
    echo "ERROR: encrypted backup — set BACKUP_ENCRYPTION_PASSPHRASE_FILE" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$BACKUP_DIR/database.sql.gz.enc" \
    -out "$TMP_DIR/database.sql.gz" -pass "file:$ENC_PASS_FILE"
  if [ -f "$BACKUP_DIR/files.tar.gz.enc" ]; then
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$BACKUP_DIR/files.tar.gz.enc" \
      -pass "file:$ENC_PASS_FILE" | tar -C "$TMP_DIR" -xzf -
  fi
  DUMP="$TMP_DIR/database.sql.gz"
  FILES_DIR="$TMP_DIR/files"
else
  DUMP="$BACKUP_DIR/database.sql.gz"
  FILES_DIR="$BACKUP_DIR/files"
fi

if [ ! -f "$DUMP" ]; then
  echo "ERROR: $DUMP not found"
  exit 1
fi

echo "==> Restoring database from $BACKUP_DIR"
gunzip -c "$DUMP" | \
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction

if [ -d "$FILES_DIR" ]; then
  if [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
    echo "ERROR: set S3_ACCESS_KEY/S3_SECRET_KEY to restore files" >&2
    exit 1
  fi
  echo "==> Restoring MinIO files"
  docker compose -f "$ROOT/docker-compose.yml" run --rm \
    -v "$FILES_DIR:/backup" \
    --entrypoint sh minio-init -c "
      mc alias set local http://minio:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
      mc mirror --overwrite /backup local/$S3_BUCKET
    "
fi

echo "==> Restore complete"