#!/bin/bash
# Bounty Watcher — multi-layer GitHub + Superteam bounty discovery
# Runs every 5 minutes via scheduler.js
# Requires env: GITHUB_PAT (optional), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CHAT_ID="${TELEGRAM_CHAT_ID:-888229115}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_PAT="${GITHUB_PAT:-}"
SEEN_DIR="/tmp/bounty_seen"
mkdir -p "$SEEN_DIR"

send_telegram() {
    if [ -n "$BOT_TOKEN" ]; then
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -H "Content-Type: application/json" \
            -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${1}\",\"parse_mode\":\"HTML\"}"
    else
        echo "$1"
    fi
}

echo "=== Bounty Watch Start: $(date -u) ==="

# 1. Superteam live listings (public endpoint works)
SUPERTEAM=$(curl -s --max-time 15 "https://superteam.fun/api/agents/listings/live?take=20" 2>/dev/null)
if [ -n "$SUPERTEAM" ] && [[ "$SUPERTEAM" != *error* ]]; then
    echo "$SUPERTEAM" | python3 -c "
import sys, json, os
data = json.load(sys.stdin)
if not isinstance(data, list): sys.exit(0)
for item in data:
    if not isinstance(item, dict): continue
    if item.get('isWinnersAnnounced', False): continue
    if item.get('status') != 'OPEN': continue
    lid = item.get('id','')
    title = item.get('title','?')[:70]
    reward = item.get('rewardAmount', 0)
    token = item.get('token','USD')
    access = item.get('agentAccess','?')
    comments = item.get('_count',{}).get('Comments',0)
    deadline = item.get('deadline','')[:10]
    # Skip if already seen
    seen_file = '/tmp/bounty_seen/superteam.txt'
    if os.path.exists(seen_file) and lid in open(seen_file).read(): continue
    with open(seen_file,'a') as f: f.write(lid+'\n')
    print(f'SUPER|{title}|{reward}|{token}|{access}|{comments}|{deadline}')
" 2>/dev/null | while IFS='|' read -r type title reward token access comments deadline; do
    [ -z "$type" ] && continue
    send_telegram "🏆 <b>Superteam Bounty</b>\n<b>${title}</b>\nReward: \$${reward} ${token}\nAccess: ${access} | Comments: ${comments}\nDeadline: ${deadline}"
done
fi

# 2. GitHub bounties — multi-layer queries
if [ -n "$GITHUB_PAT" ]; then
    for QUERY in \
        '"%24"+"bounty"+state:open+no:assignee+type:issue' \
        '"bounty"+"%24"+language:python+state:open' \
        'bounty+in:title+state:open+no:assignee'; do
        curl -s --max-time 15 "https://api.github.com/search/issues?q=${QUERY}&sort=updated&per_page=10" \
            -H "Authorization: token ${GITHUB_PAT}" 2>/dev/null | python3 -c "
import sys, json, os, re
data = json.load(sys.stdin)
seen_file = '/tmp/bounty_seen/github.txt'
os.makedirs(os.path.dirname(seen_file), exist_ok=True)
seen = set(open(seen_file).read().splitlines()) if os.path.exists(seen_file) else set()
for item in data.get('items', []):
    url = item['html_url']
    if url in seen: continue
    title = item.get('title','')
    body = item.get('body','') or ''
    # Skip $0 / fake bounties (misakanet, zero, test)
    combined = (title + ' ' + body[:300]).lower()
    if any(skip in combined for skip in ['misakanet', 'zero', '\$0', 'test bounty', 'fake']): continue
    if item.get('assignee') is not None: continue
    match = re.search(r'\\\$[\d,]+', combined)
    amount = match.group(0) if match else 'unknown'
    with open(seen_file,'a') as f: f.write(url+'\n')
    print(f'GH|{title[:70]}|{amount}|{url}|{item[\"repository_url\"].split(\"/\")[-1]}')
" 2>/dev/null | while IFS='|' read -r type title amount url repo; do
    [ -z "$type" ] && continue
    send_telegram "💰 <b>GitHub Bounty</b>\n<b>${title}</b>\nReward: ${amount}\nRepo: ${repo}\nURL: ${url}"
    done
done
fi

echo "=== Bounty Watch Complete: $(date -u) ==="
