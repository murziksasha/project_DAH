#!/usr/bin/env bash
# One-shot update on native host (no Docker): pull → install → build → migrate → restart.
# Usage (from anywhere):
#   bash /home/admin/DAH/infra/scripts/update-native.sh
#   # or from repo root:
#   npm run update:native
#
# Env:
#   SKIP_PULL=1       — do not git pull
#   SKIP_INSTALL=1    — skip npm install
#   SKIP_BUILD=1      — skip npm run build
#   SKIP_MIGRATE=1    — skip db:migrate
#   SKIP_RESTART=1    — do not systemctl restart
#   DAH_ROOT=...      — override repo root
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAH_ROOT="${DAH_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$DAH_ROOT"

echo "==> DAH native update in $DAH_ROOT"

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "==> skip git pull"
fi

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  echo "==> npm install"
  npm install
else
  echo "==> skip npm install"
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> npm run build"
  npm run build
else
  echo "==> skip build"
fi

if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  echo "==> db:migrate"
  npm run db:migrate
else
  echo "==> skip migrate"
fi

if [[ "${SKIP_RESTART:-0}" != "1" ]]; then
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files dah-api.service >/dev/null 2>&1; then
    echo "==> systemctl restart dah-api dah-worker + reload nginx"
    if [[ "$(id -u)" -eq 0 ]]; then
      systemctl restart dah-api dah-worker
      systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
    else
      sudo systemctl restart dah-api dah-worker
      sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || true
    fi
  else
    echo "==> dah-api.service not installed — restart app manually (npm run start)"
    echo "    Install autostart: sudo bash infra/scripts/install-native-systemd.sh"
  fi
else
  echo "==> skip restart"
fi

echo "==> health"
curl -sf http://127.0.0.1:3001/api/health && echo "" || echo "WARN: API health failed (is dah-api up?)"
HTTP_WEB="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo 000)"
echo "web :3000 → HTTP ${HTTP_WEB}"

echo "==> done"
