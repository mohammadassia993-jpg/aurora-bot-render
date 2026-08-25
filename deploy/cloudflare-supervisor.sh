#!/bin/sh
set -eu
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/cloudflare.log"
mkdir -p "$ROOT/logs"
cd "$ROOT"

if [ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]; then
  echo "$(date -Is) CLOUDFLARED_TUNNEL_TOKEN missing; using Pinggy fallback" >> "$LOG"
  exec bash deploy/pinggy-supervisor.sh
fi

BIN="${CLOUDFLARED_PATH:-cloudflared}"
command -v "$BIN" >/dev/null 2>&1 || {
  echo "$(date -Is) cloudflared binary not found at $BIN" >> "$LOG"
  exit 1
}

while true; do
  echo "$(date -Is) starting Cloudflare named tunnel" >> "$LOG"
  "$BIN" tunnel --no-autoupdate run --token "$CLOUDFLARED_TUNNEL_TOKEN" >> "$LOG" 2>&1 || true
  sleep 5
done
