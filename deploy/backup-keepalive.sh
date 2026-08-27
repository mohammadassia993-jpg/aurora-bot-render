#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/backup-keepalive.log"
PID_FILE="$ROOT/backup-keepalive.pid"
mkdir -p "$ROOT/logs"

# Backup platform endpoints to keep alive (pings each on a cycle)
BACKUP_URLS="${BACKUP_KEEP_ALIVE_URLS:-https://aurora-bot.bonto.run/ https://silent-giants-render-backup.onrender.com/}"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  [ -n "$OLD_PID" ] && [ -d "/proc/$OLD_PID" ] && { echo "backup keepalive already active pid=$OLD_PID"; exit 0; }
fi

echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT INT TERM

while true; do
  for URL in $BACKUP_URLS; do
    CODE=$(curl -sS --max-time 20 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
    echo "$(date -Is) $URL -> $CODE" >> "$LOG"
  done
  sleep 300
done
