#!/bin/bash
# Keep-Alive script for Render services (prevents sleep on free tier)
# Pings both services every 14 minutes

MAIN_URL="https://aurora-bot-render.onrender.com/health"
BACKUP_URL="https://silent-giants-render-backup.onrender.com/health"

echo "[$(date)] Pinging main service..."
curl -s -o /dev/null -w "Main: HTTP %{http_code}\n" --max-time 30 "$MAIN_URL" 2>/dev/null || echo "Main: FAILED"

echo "[$(date)] Pinging backup service..."
curl -s -o /dev/null -w "Backup: HTTP %{http_code}\n" --max-time 30 "$BACKUP_URL" 2>/dev/null || echo "Backup: FAILED"
