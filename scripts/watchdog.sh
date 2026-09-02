#!/bin/bash
REPO="/root/silent-giants"
LOG="$REPO/data/watchdog.log"
PORT=8788

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Only restart if Render is also down (backup mode)
RENDER_HEALTH=$(curl -s --max-time 10 "https://aurora-bot-render.onrender.com/health" 2>/dev/null)
if echo "$RENDER_HEALTH" | grep -q '"ok": true'; then
    # Render is healthy - don't restart local bot (let Render handle webhook)
    exit 0
fi

# Render is down - restart local bot as fallback
if ! curl -s --max-time 3 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    log "Bot DOWN & Render unhealthy - restarting local..."
    cd "$REPO"
    PORT=$PORT nohup node src/index.js >> data/platform.log 2>&1 &
    sleep 3
    if curl -s --max-time 3 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
        log "Restarted OK (PID $!)"
    else
        log "Restart FAILED"
    fi
fi
