#!/bin/bash
# Self-update script for Silent Giants
# Pulls latest code from GitHub and restarts

REPO_DIR="/root/silent-giants"
LOG="$REPO_DIR/data/self-update.log"

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; echo "$1"; }

log "Self-update started"

cd "$REPO_DIR" || exit 1

# Pull latest changes
if git pull origin main 2>&1 | tee -a "$LOG"; then
    log "Code updated successfully"
    
    # Install new dependencies if package.json changed
    if git diff HEAD~1 --name-only 2>/dev/null | grep -q "package.json"; then
        log "Dependencies changed, running npm install"
        npm install --omit=dev 2>&1 | tee -a "$LOG"
    fi
    
    # Restart the service
    log "Restarting service (supervisor owns recovery)..."
    PID=$(pgrep -f "node src/index.js" | head -1)
    if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null
        log "Killed platform pid $PID; supervisor will restart with latest code"
    fi
    
    # Wait for supervisor/cron watchdog to bring it back
    sleep 8
    if curl -s --max-time 5 "http://127.0.0.1:8788/health" > /dev/null 2>&1; then
        log "Service running successfully"
        # Send Telegram notification
        curl -s "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2)/sendMessage" \
            -d "chat_id=$(grep TELEGRAM_ADMIN_CHAT_ID .env | cut -d= -f2)" \
            -d "text=🔄 تحديث تلقائي: تم تحديث النظام وإعادة تشغيله بنجاح" \
            -d "parse_mode=HTML" >> "$LOG" 2>&1
    else
        log "ERROR: Service not yet up; cron watchdog will retry"
        # Direct fallback if no supervisor/watchdog is running
        if ! pgrep -f "node src/index.js" >/dev/null; then
            cd "$REPO_DIR"
            PORT=8788 nohup node src/index.js >> data/platform.log 2>&1 &
            log "Fallback started with PID $!"
        fi
    fi
else
    log "No updates available or pull failed"
fi

log "Self-update completed"
