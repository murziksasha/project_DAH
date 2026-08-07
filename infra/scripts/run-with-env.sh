#!/usr/bin/env bash
# Load repo-root .env then exec the remaining args (for systemd / manual native runs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${DAH_ENV_FILE:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-with-env: missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export NODE_ENV="${NODE_ENV:-production}"
cd "$ROOT"
exec "$@"
