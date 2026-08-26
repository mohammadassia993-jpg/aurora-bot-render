#!/bin/bash
# Auto-sync state to GitHub
REPO="/root/silent-giants"
STATE="$REPO/state/TEAM_STATE.md"
LOG="$REPO/data/sync.log"

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Update timestamp in TEAM_STATE.md
if [ -f "$STATE" ]; then
    sed -i "s/> \*\*آخر تحديث:\*\* .*/> **آخر تحديث:** $(date -Iseconds)/" "$STATE"
fi

# Git add, commit, push
cd "$REPO" || exit 1
git add state/ 2>/dev/null
if git diff --cached --quiet; then
    log "No state changes to sync"
else
    git commit -m "State update: $(date +%Y-%m-%d_%H:%M)" 2>/dev/null
    git push origin main 2>&1 | tail -1 >> "$LOG"
    log "State synced to GitHub"
fi
