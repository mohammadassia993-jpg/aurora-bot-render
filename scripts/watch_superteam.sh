#!/bin/bash
# Bounty Watcher — Web3 bounty discovery (Superteam + GitHub)
# Requires env: GITHUB_PAT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CHAT_ID="${TELEGRAM_CHAT_ID:-888229115}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_PAT="${GITHUB_PAT:-}"
SEEN_FILE="/tmp/superteam_seen.txt"
touch "$SEEN_FILE"

send_telegram() {
    if [ -n "$BOT_TOKEN" ]; then
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -H "Content-Type: application/json" \
            -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${1}\",\"parse_mode\":\"HTML\"}"
    fi
}

# GitHub bounties from last 6 hours
if [ -n "$GITHUB_PAT" ]; then
    SINCE=$(date -u -d '6 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-6H +%Y-%m-%dT%H:%M:%SZ)
    curl -s --max-time 30 "https://api.github.com/search/issues?q=bounty+in:title+state:open+created:>${SINCE}&sort=created&order=desc&per_page=10" \
        -H "Authorization: token ${GITHUB_PAT}" 2>/dev/null | python3 -c "
import sys,json
data=json.load(sys.stdin)
for item in data.get('items',[]):
    print(f'#{item[\"number\"]}: {item[\"title\"][:80]}')
    print(f'  URL: {item[\"html_url\"]}')
" 2>/dev/null
fi

echo "=== Superteam Watch Complete: $(date -u) ==="
