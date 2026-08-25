#!/bin/bash
# Watchdog: restart bot if crashed, self-update every hour

REPO_DIR="/root/silent-giants"
LOG="$REPO_DIR/data/watchdog.log"
PORT=8788

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Check if bot is running
if ! pgrep -f "node.*src/index.js" > /dev/null 2>&1; then
    log "Bot not running, restarting..."
    cd "$REPO_DIR"
    PORT=$PORT nohup node src/index.js >> data/platform.log 2>&1 &
    log "Restarted with PID $!"
fi

# Self-update every hour (check minute)
MINUTE=$(date +%M)
HOUR=$(date +%H)
if [ "$MINUTE" = "00" ]; then
    log "Hourly self-update check"
    bash "$REPO_DIR/scripts/self-update.sh" >> "$LOG" 2>&1
fi
