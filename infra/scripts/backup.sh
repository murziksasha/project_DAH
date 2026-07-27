#!/usr/bin/env sh
# Backup PostgreSQL + MinIO files for DAH
# Usage: ./infra/scripts/backup.sh [output_dir]
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${1:-$ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="$BACKUP_DIR/$TIMESTAMP"

POSTGRES_USER="${POSTGRES_USER:-dah}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dah_secret_change_me}"
POSTGRES_DB="${POSTGRES_DB:-dah}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-dah_minio}"
S3_SECRET_KEY="${S3_SECRET_KEY:-dah_minio_secret_change_me}"
S3_BUCKET="${S3_BUCKET:-dah-files}"

mkdir -p "$RUN_DIR"

echo "==> DAH backup → $RUN_DIR"

if docker compose -f "$ROOT/docker-compose.yml" ps postgres --status running >/dev/null 2>&1; then
  echo "==> PostgreSQL dump"
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$RUN_DIR/database.sql.gz"
else
  echo "WARN: postgres container not running, skipping DB dump"
fi

if docker compose -f "$ROOT/docker-compose.yml" ps minio --status running >/dev/null 2>&1; then
  echo "==> MinIO files mirror"
  mkdir -p "$RUN_DIR/files"
  docker compose -f "$ROOT/docker-compose.yml" run --rm \
    -v "$RUN_DIR/files:/backup" \
    --entrypoint sh minio-init -c "
      mc alias set local http://minio:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
      mc mirror --overwrite local/$S3_BUCKET /backup
    "
else
  echo "WARN: minio container not running, skipping files backup"
fi

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$RUN_DIR/manifest.json" <<EOF
{"timestamp":"$TIMESTAMP","postgres_db":"$POSTGRES_DB","s3_bucket":"$S3_BUCKET","finishedAt":"$FINISHED_AT"}
EOF

# Marker for API health /admin/ops (BACKUP_STATUS_PATH)
cat > "$BACKUP_DIR/last-backup.json" <<EOF
{"finishedAt":"$FINISHED_AT","runDir":"$RUN_DIR","timestamp":"$TIMESTAMP"}
EOF

ln -sfn "$RUN_DIR" "$BACKUP_DIR/latest"
echo "==> Done: $RUN_DIR"