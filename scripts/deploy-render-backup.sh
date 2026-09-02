#!/bin/bash
# Deploy aurora-bot-backup to Render via API
# Usage: export RENDER_API_KEY=rnd_xxxxx && bash scripts/deploy-render-backup.sh
set -euo pipefail

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "❌ RENDER_API_KEY not set."
  echo "   Get from: https://dashboard.render.com/u/settings#api-keys"
  exit 1
fi

API="https://api.render.com/v1"
REPO="https://github.com/mohammadassia993-jpg/aurora-bot-render"

echo "🔗 Creating aurora-bot-backup service..."

RESULT=$(curl -s -X POST "$API/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"web_service\",
    \"name\": \"aurora-bot-backup\",
    \"env\": \"node\",
    \"repo\": \"$REPO\",
    \"branch\": \"main\",
    \"buildCommand\": \"npm ci --omit=dev || npm install --omit=dev\",
    \"startCommand\": \"bash deploy/render/start.sh\",
    \"plan\": \"free\",
    \"serviceDetails\": {
      \"healthCheckPath\": \"/health\"
    }
  }")

echo "$RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'service' in d:
    s=d['service']
    print(f\"✅ Service created: {s.get('name','?')}\")
    print(f\"   ID: {s.get('service_id','?')}\")
    print(f\"   URL: https://{s.get('name','?')}.onrender.com\")
elif 'error' in d:
    print(f\"❌ Error: {d['error']}\")
else:
    print(json.dumps(d, indent=2))
"

echo ""
echo "---ENV VARS---"
SERVICE_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service',{}).get('service_id',''))" 2>/dev/null)
if [ -n "$SERVICE_ID" ]; then
  echo "Setting environment variables..."
  
  for KV in \
    "PORT=8788" \
    "PLATFORM_ROLE=render" \
    "TELEGRAM_BOT_TOKEN=8964456145:AAEcQ5AGdssnNbgMRW06b96PMiaXXvsWVdE" \
    "TELEGRAM_ADMIN_CHAT_ID=888229115" \
    "AGNES_API_KEY=sk-MNKF4OnRdkKmM8xcFSHqejeEQgfP2vPc6DX5EYXpy8J2hREN" \
    "AGNES_API_URL=https://apihub.agnes-ai.com/v1" \
    "AGNES_MODEL=agnes-2.0-flash" \
    "AI_PRIMARY_MODEL=agnes" \
    "TELEGRAM_FAILOVER=false" \
    "OFFICIAL_EMAIL=auroraalmada4@gmail.com" \
    "AI_SIMULATION_MODE=false" \
    "MAIL_DELIVERY_MODE=disabled" \
    "ALLOW_DATABASE_RESTORE_RESTART=true"; do
    
    KEY="${KV%%=*}"
    VAL="${KV#*=}"
    curl -s -X POST "$API/services/$SERVICE_ID/env-vars" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"$KEY\",\"value\":\"$VAL\"}" > /dev/null 2>&1
    echo "  ✅ $KEY"
  done
  
  echo ""
  echo "---DEPLOY---"
  curl -s -X POST "$API/services/$SERVICE_ID/deploys" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'deploy' in d:
    print(f\"✅ Deploy triggered: {d['deploy'].get('id','?')}\")
else:
    print(json.dumps(d, indent=2))
"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 https://aurora-bot-backup.onrender.com"
