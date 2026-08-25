#!/bin/sh
set -u

ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
URL="${RENDER_KEEP_ALIVE_URL:-https://silent-giants-render-backup.onrender.com/keepalive}"
LOG="$ROOT/logs/render-keepalive.log"
PID_FILE="$ROOT/render-keepalive.pid"
mkdir -p "$ROOT/logs"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  [ -n "$OLD_PID" ] && [ -d "/proc/$OLD_PID" ] && { echo "render keepalive already active pid=$OLD_PID"; exit 0; }
fi

echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT INT TERM

while true; do
  if curl -fsS --max-time 45 "$URL" >> "$LOG" 2>&1; then
    echo "$(date -Is) render keepalive ok" >> "$LOG"
  else
    echo "$(date -Is) render keepalive failed" >> "$LOG"
  fi
  sleep 300
done
