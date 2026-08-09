#!/usr/bin/env bash
# Ensure S3 bucket exists (mc). Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${DAH_ENV_FILE:-$ROOT/.env}"
MC_BIN="${MC_BIN:-mc}"
ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-minio-init: missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ACCESS="${S3_ACCESS_KEY:-dah_minio}"
SECRET="${S3_SECRET_KEY:-dah_minio_secret_change_me}"
BUCKET="${S3_BUCKET:-dah-files}"

if ! command -v "$MC_BIN" >/dev/null 2>&1; then
  echo "run-minio-init: mc not found (install MinIO client); skip bucket create" >&2
  exit 0
fi

for i in $(seq 1 30); do
  if curl -sf "${ENDPOINT}/minio/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "run-minio-init: MinIO not ready at $ENDPOINT" >&2
    exit 1
  fi
done

"$MC_BIN" alias set dah-local "$ENDPOINT" "$ACCESS" "$SECRET" >/dev/null
"$MC_BIN" mb --ignore-existing "dah-local/${BUCKET}"
echo "run-minio-init: bucket ok: ${BUCKET}"
