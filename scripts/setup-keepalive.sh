#!/bin/bash
# Keep-Alive Setup for Render - uses cron-job.org API
# Usage: export CRON_API_KEY=your_key && export RENDER_URL=https://your.onrender.com && bash scripts/setup-keepalive.sh
set -euo pipefail

RENDER_URL="${RENDER_URL:-https://silent-giants-primary.onrender.com}"
CRON_API="${CRON_API_KEY:-}"
HEALTH_URL="$RENDER_URL/health"

if [ -z "$CRON_API" ]; then
  echo "❌ CRON_API_KEY not set."
  echo "   1. Go to https://cron-job.org"
  echo "   2. Sign up with $RENDER_URL"
  echo "   3. Go to Settings → API → Create Key"
  echo "   4. Run: export CRON_API_KEY=your_key"
  exit 1
fi

echo "🔗 Creating Keep-Alive job for $HEALTH_URL..."
RESULT=$(curl -s -X POST "https://api.cron-job.org/jobs" \
  -H "Authorization: Bearer $CRON_API" \
  -H "Content-Type: application/json" \
  -d "{
    \"job\": {
      \"url\": \"$HEALTH_URL\",
      \"schedule\": {
        \"timezone\": \"UTC\",
        \"expiresAt\": 0,
        \"every\": 840,
        \"unit\": \"seconds\"
      },
      \"requestMethod\": 0,
      \"notification\": {
        \"onFailure\": [],
        \"onSuccess\": []
      }
    }
  }")
echo "$RESULT" | head -10
echo "✅ Keep-Alive job created (every 14 minutes)"
