#!/usr/bin/env sh
# Backup PostgreSQL + MinIO files for DAH
# Usage: ./infra/scripts/backup.sh [output_dir]
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${1:-$ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="$BACKUP_DIR/$TIMESTAMP"

POSTGRES_USER="${POSTGRES_USER:-dah}"
POSTGRES_DB="${POSTGRES_DB:-dah}"
# M17: no built-in fallback secrets — S3 credentials must come from the environment.
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_BUCKET="${S3_BUCKET:-dah-files}"
# M17: optional at-rest encryption (AES-256-CBC + PBKDF2 via openssl).
# BACKUP_ENCRYPTION_PASSPHRASE_FILE=/root/.dah-backup-pass (chmod 600)
ENC_PASS_FILE="${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}"
STATUS="ok"
NOTES=""

if [ -n "$ENC_PASS_FILE" ] && [ ! -r "$ENC_PASS_FILE" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE_FILE=$ENC_PASS_FILE is not readable" >&2
  exit 1
fi

encrypt_file() {
  # $1 = plain file; produces $1.enc and removes the plain file
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$1" -out "$1.enc" -pass "file:$ENC_PASS_FILE"
  rm -f "$1"
}

mkdir -p "$RUN_DIR"

echo "==> DAH backup → $RUN_DIR"

if docker compose -f "$ROOT/docker-compose.yml" ps postgres --status running >/dev/null 2>&1; then
  echo "==> PostgreSQL dump"
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$RUN_DIR/database.sql.gz"
else
  # M17: a backup without the database is a failure — do not touch the health marker.
  echo "ERROR: postgres container not running, DB dump impossible" >&2
  exit 1
fi

if [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
  echo "WARN: S3_ACCESS_KEY/S3_SECRET_KEY not set — files are NOT backed up (status=partial)" >&2
  STATUS="partial"; NOTES="files_skipped_no_credentials"
elif docker compose -f "$ROOT/docker-compose.yml" ps minio --status running >/dev/null 2>&1; then
  echo "==> MinIO files mirror"
  mkdir -p "$RUN_DIR/files"
  docker compose -f "$ROOT/docker-compose.yml" run --rm \
    -v "$RUN_DIR/files:/backup" \
    --entrypoint sh minio-init -c "
      mc alias set local http://minio:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
      mc mirror --overwrite local/$S3_BUCKET /backup
    " || { echo "WARN: MinIO mirror failed (status=partial)" >&2; STATUS="partial"; NOTES="files_mirror_failed"; }
else
  echo "WARN: minio container not running, files are NOT backed up (status=partial)" >&2
  STATUS="partial"; NOTES="files_skipped_minio_down"
fi

ENCRYPTED=false
if [ -n "$ENC_PASS_FILE" ]; then
  echo "==> Encrypting backup (openssl aes-256-cbc, pbkdf2)"
  encrypt_file "$RUN_DIR/database.sql.gz"
  if [ -d "$RUN_DIR/files" ]; then
    tar -C "$RUN_DIR" -czf "$RUN_DIR/files.tar.gz" files && rm -rf "$RUN_DIR/files"
    encrypt_file "$RUN_DIR/files.tar.gz"
  fi
  ENCRYPTED=true
fi

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$RUN_DIR/manifest.json" <<EOF
{"timestamp":"$TIMESTAMP","postgres_db":"$POSTGRES_DB","s3_bucket":"$S3_BUCKET","finishedAt":"$FINISHED_AT","status":"$STATUS","notes":"$NOTES","encrypted":$ENCRYPTED}
EOF

# Marker for API health /admin/ops (BACKUP_STATUS_PATH)
cat > "$BACKUP_DIR/last-backup.json" <<EOF
{"finishedAt":"$FINISHED_AT","runDir":"$RUN_DIR","timestamp":"$TIMESTAMP","status":"$STATUS","notes":"$NOTES","encrypted":$ENCRYPTED}
EOF

ln -sfn "$RUN_DIR" "$BACKUP_DIR/latest"
echo "==> Done: $RUN_DIR (status=$STATUS)"