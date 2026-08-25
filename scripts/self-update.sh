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
    log "Restarting service..."
    PID=$(pgrep -f "node src/index.js" | head -1)
    if [ -n "$PID" ]; then
        kill -9 "$PID" 2>/dev/null
        sleep 2
    fi
    
    cd "$REPO_DIR"
    PORT=8788 nohup node src/index.js >> data/platform.log 2>&1 &
    NEW_PID=$!
    log "Service restarted with PID $NEW_PID"
    
    # Verify it's running
    sleep 3
    if kill -0 "$NEW_PID" 2>/dev/null; then
        log "Service running successfully"
        # Send Telegram notification
        curl -s "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2)/sendMessage" \
            -d "chat_id=$(grep TELEGRAM_ADMIN_CHAT_ID .env | cut -d= -f2)" \
            -d "text=🔄 تحديث تلقائي: تم تحديث النظام وإعادة تشغيله بنجاح" \
            -d "parse_mode=HTML" >> "$LOG" 2>&1
    else
        log "ERROR: Service failed to start"
    fi
else
    log "No updates available or pull failed"
fi

log "Self-update completed"
