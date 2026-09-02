#!/bin/bash
# Render Deploy Script - uses RENDER_API_KEY env var
# Usage: export RENDER_API_KEY=rnd_xxxxx && bash scripts/deploy-render.sh
set -euo pipefail
ROOT="$HOME/silent-giants"
API="https://api.render.com/v1"

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "❌ RENDER_API_KEY not set. Run: export RENDER_API_KEY=rnd_xxxxx"
  echo "   Get your key from: https://dashboard.render.com/u/settings#api-keys"
  exit 1
fi

echo "🔗 Connecting to Render..."
# Check existing services
echo "📋 Existing services:"
curl -s "$API/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" | node -e "
    process.stdin.on('data',d=>{
      const r=JSON.parse(d);
      if(r.items) r.items.forEach(s=>console.log('  -',s.name,'(',s.service_id,') status:',s.suspended?'SUSPENDED':'active'));
      else console.log('  No services found');
    });
  "

echo ""
echo "🚀 Deploying via Blueprint..."
# Trigger deploy on existing service
RESULT=$(curl -s -X POST "$API/services/srv-DEPLOY_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1)
echo "$RESULT" | head -5
