#!/usr/bin/env bash
# Start MinIO with credentials from root .env (S3_* or MINIO_ROOT_*).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${DAH_ENV_FILE:-$ROOT/.env}"
DATA_DIR="${MINIO_DATA_DIR:-$HOME/minio-data}"
MINIO_BIN="${MINIO_BIN:-minio}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-minio: missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export MINIO_ROOT_USER="${MINIO_ROOT_USER:-${S3_ACCESS_KEY:-dah_minio}}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-${S3_SECRET_KEY:-dah_minio_secret_change_me}}"

if [[ -z "${MINIO_ROOT_USER}" || -z "${MINIO_ROOT_PASSWORD}" ]]; then
  echo "run-minio: MINIO_ROOT_USER / MINIO_ROOT_PASSWORD (or S3_ACCESS_KEY / S3_SECRET_KEY) required" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
exec "$MINIO_BIN" server "$DATA_DIR" --address "${MINIO_ADDRESS:-:9000}" --console-address "${MINIO_CONSOLE_ADDRESS:-:9001}"
