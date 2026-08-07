#!/usr/bin/env bash
# Install systemd units + nginx site for native (no Docker) DAH host.
# Usage:
#   cd /home/admin/DAH
#   sudo bash infra/scripts/install-native-systemd.sh
# Env overrides:
#   DAH_ROOT  RUN_USER  WEB_PORT  SKIP_NGINX=1
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DAH_ROOT="${DAH_ROOT:-$DEFAULT_ROOT}"
RUN_USER="${RUN_USER:-${SUDO_USER:-admin}}"
WEB_PORT="${WEB_PORT:-3000}"
SKIP_NGINX="${SKIP_NGINX:-0}"

if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "User not found: $RUN_USER (set RUN_USER=...)" >&2
  exit 1
fi
RUN_GROUP="$(id -gn "$RUN_USER")"

if [[ ! -f "$DAH_ROOT/.env" ]]; then
  echo "Missing $DAH_ROOT/.env — copy from .env.example and set localhost URLs first." >&2
  exit 1
fi

if [[ ! -f "$DAH_ROOT/apps/api/dist/src/main.js" ]]; then
  echo "API not built. As $RUN_USER run: cd $DAH_ROOT && npm run build" >&2
  exit 1
fi

if [[ ! -d "$DAH_ROOT/apps/web/out" ]]; then
  echo "Web export missing ($DAH_ROOT/apps/web/out). Run: npm run build -w @dah/web" >&2
  exit 1
fi

# Resolve node for the target user (nvm / nodesource)
NODE_BIN="$(sudo -u "$RUN_USER" -H bash -lc 'command -v node' 2>/dev/null || true)"
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node not found. Install Node.js >= 20 for user $RUN_USER." >&2
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"
# Keep system paths + node dir for child processes
UNIT_PATH="${NODE_DIR}:/usr/local/bin:/usr/bin:/bin"

echo "DAH_ROOT=$DAH_ROOT"
echo "RUN_USER=$RUN_USER ($RUN_GROUP)"
echo "NODE=$NODE_BIN"
echo "WEB_PORT=$WEB_PORT"

chmod +x \
  "$DAH_ROOT/infra/scripts/run-with-env.sh" \
  "$DAH_ROOT/infra/scripts/run-minio.sh" \
  "$DAH_ROOT/infra/scripts/run-minio-init.sh" \
  "$DAH_ROOT/infra/scripts/install-native-systemd.sh"

render() {
  local src="$1"
  local dst="$2"
  sed \
    -e "s|@@DAH_ROOT@@|${DAH_ROOT}|g" \
    -e "s|@@USER@@|${RUN_USER}|g" \
    -e "s|@@GROUP@@|${RUN_GROUP}|g" \
    -e "s|@@NODE@@|${NODE_BIN}|g" \
    -e "s|@@PATH@@|${UNIT_PATH}|g" \
    -e "s|@@WEB_PORT@@|${WEB_PORT}|g" \
    "$src" >"$dst"
}

UNIT_DIR=/etc/systemd/system
for name in dah-minio dah-minio-init dah-api dah-worker; do
  render "$DAH_ROOT/infra/systemd/${name}.service.in" "$UNIT_DIR/${name}.service"
done
render "$DAH_ROOT/infra/systemd/dah.target.in" "$UNIT_DIR/dah.target"

# MinIO binary check
if ! sudo -u "$RUN_USER" -H bash -lc 'command -v minio' >/dev/null 2>&1; then
  if ! command -v minio >/dev/null 2>&1; then
    echo "WARNING: minio not in PATH. Install to /usr/local/bin/minio before enable." >&2
  fi
fi

if [[ "$SKIP_NGINX" != "1" ]]; then
  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx not found — installing..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
  fi
  render "$DAH_ROOT/infra/nginx/dah-native.conf.in" /etc/nginx/sites-available/dah
  ln -sfn /etc/nginx/sites-available/dah /etc/nginx/sites-enabled/dah
  # Avoid default site binding :80 conflicts when we only need WEB_PORT
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi
  nginx -t
fi

systemctl daemon-reload

if systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
  systemctl enable --now postgresql.service || true
elif systemctl list-unit-files postgresql@.service >/dev/null 2>&1; then
  echo "Note: enable your postgresql cluster unit manually if needed."
fi

systemctl enable --now dah-minio.service
systemctl enable --now dah-minio-init.service || true
systemctl enable --now dah-api.service
systemctl enable --now dah-worker.service
systemctl enable dah.target

if [[ "$SKIP_NGINX" != "1" ]]; then
  systemctl enable --now nginx.service
  systemctl reload nginx.service || systemctl restart nginx.service
fi

echo ""
echo "Installed. Status:"
systemctl --no-pager --full status dah-minio dah-api dah-worker || true
echo ""
echo "Health checks:"
echo "  curl -s http://127.0.0.1:3001/api/health"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:${WEB_PORT}/"
echo ""
echo "Boot: systemctl enable already set for dah-* and nginx."
echo "Manual app (without systemd): cd $DAH_ROOT && npm run start"
echo "Logs: journalctl -u dah-api -f"
