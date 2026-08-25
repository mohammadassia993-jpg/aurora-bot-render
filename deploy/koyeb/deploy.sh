#!/bin/bash
# Koyeb Auto-Deploy Script
# Usage: KOYEB_TOKEN=xxx bash deploy/koyeb/deploy.sh

set -e

TOKEN="${KOYEB_TOKEN:?Set KOYEB_TOKEN environment variable}"
REPO="mohammadassia993-jpg/aurora-bot-render"
BRANCH="main"
SERVICE_NAME="silent-giants"
APP_NAME="silent-giants-primary"

echo "=== Step 1: Creating Koyeb service ==="

# Create the service via Koyeb API
curl -s -X POST "https://api.koyeb.com/v1/services" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$SERVICE_NAME\",
    \"definition\": {
      \"name\": \"$APP_NAME\",
      \"type\": \"WEB\",
      \"git\": {
        \"repository\": \"$REPO\",
        \"branch\": \"$BRANCH\",
        \"build_command\": \"npm ci --omit=dev\",
        \"start_command\": \"node src/index.js\"
      },
      \"instance_type\": \"nano\",
      \"ports\": [{\"port\": 8787, \"protocol\": \"HTTP\"}],
      \"env\": [
        {\"key\": \"PORT\", \"value\": \"8787\", \"type\": \"GENERAL\"},
        {\"key\": \"TELEGRAM_BOT_TOKEN\", \"value\": \"8964456145:AAEcQ5AGdssnNbgMRW06b96PMiaXXvsWVdE\", \"type\": \"GENERAL\"},
        {\"key\": \"TELEGRAM_WEBHOOK_SECRET\", \"value\": \"b5rRBpEPisZmxMvw8gAtk-Wl21mgFEXkZkeNUj3lY8c\", \"type\": \"GENERAL\"},
        {\"key\": \"TEAM_UI_TOKEN\", \"value\": \"8cdQ7WY9SvAGxe6SfFPlngj0_UbX6vCr\", \"type\": \"GENERAL\"},
        {\"key\": \"OPENROUTER_API_KEY\", \"value\": \"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\", \"type\": \"GENERAL\"},
        {\"key\": \"AI_SIMULATION_MODE\", \"value\": \"true\", \"type\": \"GENERAL\"},
        {\"key\": \"TELEGRAM_FAILOVER\", \"value\": \"false\", \"type\": \"GENERAL\"},
        {\"key\": \"OFFICIAL_EMAIL\", \"value\": \"auroraalmada4@gmail.com\", \"type\": \"GENERAL\"},
        {\"key\": \"BACKUP_EMAIL\", \"value\": \"Mohammadassia993@gmail.com\", \"type\": \"GENERAL\"},
        {\"key\": \"MAIL_DELIVERY_MODE\", \"value\": \"queue\", \"type\": \"GENERAL\"}
      ],
      \"healthcheck\": {
        \"path\": \"/health\",
        \"interval\": 30,
        \"timeout\": 5
      }
    }
  }" 2>/dev/null | python3 -m json.tool 2>/dev/null | head -30

echo ""
echo "=== Step 2: Waiting for deployment ==="
echo "Check status at: https://app.koyeb.com"
echo "Service will be available at: https://$APP_NAME.koyeb.app"
