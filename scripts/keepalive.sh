#!/bin/bash
# Keep-alive watchdog for local platform + backup mirrors
REPO="/root/silent-giants"
LOG="$REPO/data/keepalive.log"
PORT=8788

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Local health
if curl -s --max-time 5 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
  :
else
  log "Local platform DOWN - supervisor handles restart (checking process)"
  pgrep -f "node src/index.js" >/dev/null && log "platform process exists but unhealthy" || log "platform process missing"
fi

# Keep backup mirrors alert (no auto-ping needed; they self-run)
BACKUP_URLS="${BACKUP_KEEP_ALIVE_URLS:-https://aurora-bot.bonto.run/ https://silent-giants-render-backup.onrender.com/}"
for URL in $BACKUP_URLS; do
  CODE=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
  log "backup $URL -> $CODE"
done
