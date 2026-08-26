#!/bin/bash
REPO="/root/silent-giants"
LOG="$REPO/data/watchdog.log"
PORT=8788

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Check if bot is running
if ! curl -s --max-time 3 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    log "Bot DOWN - restarting..."
    cd "$REPO"
    PORT=$PORT nohup node src/index.js >> data/platform.log 2>&1 &
    sleep 3
    if curl -s --max-time 3 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
        log "Restarted OK (PID $!)"
    else
        log "Restart FAILED"
    fi
fi
