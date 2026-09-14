#!/bin/bash
# GitHub Bounty Watcher — scans for bounty issues
# Requires env: GITHUB_PAT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CHAT_ID="${TELEGRAM_CHAT_ID:-888229115}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_PAT="${GITHUB_PAT:-}"
SEEN_FILE="/tmp/github_bounty_seen.txt"
touch "$SEEN_FILE"

send_telegram() {
    if [ -n "$BOT_TOKEN" ]; then
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -H "Content-Type: application/json" \
            -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${1}\",\"parse_mode\":\"HTML\"}"
    fi
}

if [ -z "$GITHUB_PAT" ]; then
    echo "GITHUB_PAT not set — skipping GitHub search"
    exit 0
fi

QUERY='bounty+in:title+state:open+label:bounty'
RESULTS=$(curl -s --max-time 30 "https://api.github.com/search/issues?q=${QUERY}&sort=created&order=desc&per_page=10" \
    -H "Authorization: token ${GITHUB_PAT}" 2>/dev/null)

echo "$RESULTS" | python3 -c "
import sys,json,re
data=json.load(sys.stdin)
items=data.get('items',[])
seen=set(open('$SEEN_FILE').read().splitlines())
count=0
for item in items:
    url=item['html_url']
    if url in seen: continue
    title=item['title'][:80]
    match=re.search(r'\\\$[\d,]+|[\d,]+\s*USD', title+item.get('body','')[:200])
    amount=match.group(0) if match else 'unknown'
    repo=item['repository_url'].split('/')[-2:]
    count+=1
    print(f'BOUNTY|{title}|{amount}|{url}|{\"/\".join(repo)}')
    with open('$SEEN_FILE','a') as f: f.write(url+'\n')
print(f'TOTAL_NEW:{count}')
" 2>/dev/null | while IFS='|' read -r type title amount url repo; do
    if [[ "$type" == "BOUNTY" ]]; then
        send_telegram "💰 <b>Bounty found</b>\n<b>${title}</b>\nReward: ${amount}\nRepo: ${repo}\nURL: ${url}"
    fi
done

echo "=== GitHub Watch Complete: $(date -u) ==="
