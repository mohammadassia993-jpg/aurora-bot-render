#!/usr/bin/env bash
# Usage: bash scripts/rotate-bot-token.sh <NEW_BOT_TOKEN>
# Reads all secrets from env vars (no hardcoded keys).
# Validates the token, updates .env + Render env (full set), redeploys primary,
# sets webhook, and verifies. Run this ONLY with a token confirmed via getMe.
set -euo pipefail
NEW_TOKEN="${1:-}"
RENDER_KEY="${RENDER_API_KEY:?Set RENDER_API_KEY}"
SID="${RENDER_SERVICE_ID:?Set RENDER_SERVICE_ID}"
WEBHOOK_URL="${TELEGRAM_WEBHOOK_URL:?Set TELEGRAM_WEBHOOK_URL}"
SECRET="${TELEGRAM_WEBHOOK_SECRET:?Set TELEGRAM_WEBHOOK_SECRET}"

if [ -z "$NEW_TOKEN" ]; then echo "usage: $0 <TOKEN>"; exit 1; fi

echo "1) Validating token..."
VALID=$(curl -s --max-time 12 "https://api.telegram.org/bot${NEW_TOKEN}/getMe" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')")
if [ "$VALID" != "ok" ]; then echo "❌ Token rejected by Telegram (401). Not applying."; exit 2; fi
echo "✅ Token valid."

echo "2) Updating local .env..."
sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${NEW_TOKEN}|" .env
grep -c "^TELEGRAM_BOT_TOKEN=${NEW_TOKEN}$" .env | xargs -I{} echo "  .env updated ({} match)"

echo "3) Updating Render env-vars..."
python3 - "$NEW_TOKEN" <<'PYEOF'
import json, os, sys, urllib.request
new_token = sys.argv[1]
KEY = os.environ["RENDER_API_KEY"]
SID = os.environ["RENDER_SERVICE_ID"]
env = {
 "AGNES_API_KEY": os.environ.get("AGNES_API_KEY", ""),
 "AGNES_API_URL": os.environ.get("AGNES_API_URL", ""),
 "AGNES_MODEL": os.environ.get("AGNES_MODEL", "agnes-2.0-flash"),
 "AI_PRIMARY_MODEL": os.environ.get("AI_PRIMARY_MODEL", "agnes"),
 "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY", ""),
 "NODE_OPTIONS": "--max-old-space-size=384",
 "OPENAI_BASE_URL": os.environ.get("OPENAI_BASE_URL", ""),
 "OPENROUTER_API_KEY": os.environ.get("OPENROUTER_API_KEY", ""),
 "SUPERTEAM_AGENT_API_KEY": os.environ.get("SUPERTEAM_AGENT_API_KEY", ""),
 "SUPERTEAM_EMAIL": os.environ.get("SUPERTEAM_EMAIL", ""),
 "SUPERTEAM_PASSWORD": os.environ.get("SUPERTEAM_PASSWORD", ""),
 "TELEGRAM_ADMIN_CHAT_ID": os.environ.get("TELEGRAM_ADMIN_CHAT_ID", ""),
 "TELEGRAM_ALLOWED_IDS": os.environ.get("TELEGRAM_ALLOWED_IDS", ""),
 "TELEGRAM_BOT_TOKEN": new_token,
 "PLATFORM_ROLE": "primary",
 "TELEGRAM_FAILOVER": os.environ.get("TELEGRAM_FAILOVER", "true"),
 "TELEGRAM_WEBHOOK_SECRET": os.environ.get("TELEGRAM_WEBHOOK_SECRET", ""),
 "TELEGRAM_WEBHOOK_SYNC_DISABLED": "true",
 "TELEGRAM_WEBHOOK_URL": os.environ.get("TELEGRAM_WEBHOOK_URL", ""),
}
payload = [{"key": k, "value": v} for k, v in sorted(env.items()) if v]
req = urllib.request.Request(
    f"https://api.render.com/v1/services/{SID}/env-vars", method="PUT",
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    data=json.dumps(payload).encode())
with urllib.request.urlopen(req) as r:
    print("  PUT HTTP", r.status)
req2 = urllib.request.Request(f"https://api.render.com/v1/services/{SID}/env-vars", headers={"Authorization": f"Bearer {KEY}"})
with urllib.request.urlopen(req2) as r:
    actual = {item["envVar"]["key"]: item["envVar"]["value"] for item in json.loads(r.read())}
assert actual.get("TELEGRAM_BOT_TOKEN") == new_token, "token not applied!"
print(f"  Render env updated ({len(actual)} vars, token applied).")
PYEOF

echo "4) Redeploying primary..."
curl -s -X POST "https://api.render.com/v1/services/${SID}/deploys" \
  -H "Authorization: Bearer ${RENDER_KEY}" -H "Content-Type: application/json" >/dev/null
for i in $(seq 1 20); do
  sleep 15
  ST=$(curl -s "https://api.render.com/v1/services/${SID}/deploys?limit=1" \
    -H "Authorization: Bearer ${RENDER_KEY}" | python3 -c "import sys,json; d=json.load(sys.stdin)[0]; print(d.get('deploy',d).get('status'))" 2>/dev/null)
  echo "  deploy status: $ST"
  [ "$ST" = "live" ] && break
done
[ "$ST" = "live" ] || { echo "deploy not live; check manually"; exit 3; }

echo "5) Setting webhook with new token..."
curl -s --max-time 20 "https://api.telegram.org/bot${NEW_TOKEN}/setWebhook?url=${WEBHOOK_URL}&secret_token=${SECRET}&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  webhook:', d.get('ok'))"

echo "6) Verifying..."
curl -s --max-time 15 "${WEBHOOK_URL%/telegram/webhook}/status" | python3 -c "import sys,json; print('  status:', json.dumps(json.load(sys.stdin).get('telegram')))"
curl -s --max-time 15 "https://api.telegram.org/bot${NEW_TOKEN}/getWebhookInfo" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print('  webhook info:', r.get('url'))"
echo "✅ Rotation complete."
