#!/bin/bash
# Follow-up Mechanism — checks replies on our bounty claims every 15 min
# Requires env: GITHUB_PAT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CHAT_ID="${TELEGRAM_CHAT_ID:-888229115}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
GITHUB_PAT="${GITHUB_PAT:-}"
STATE_FILE="/tmp/followup_state.json"
REPO_LIST="BasedHardware/omi zhangjiayang6835-cyber/bounty-plaza intuition-box/Ontology"
ISSUE_LIST="13884 1214 9"
COMMENT_IDS="5674593952 5668696733 5668696734"
GITHUB_USER="mohammadassia993-jpg"

send_telegram() {
    if [ -n "$BOT_TOKEN" ]; then
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -H "Content-Type: application/json" \
            -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${1}\",\"parse_mode\":\"HTML\"}"
    else
        echo "$1"
    fi
}

echo "=== Follow-up Check: $(date -u) ==="

if [ -z "$GITHUB_PAT" ]; then
    echo "GITHUB_PAT not set — skipping"
    exit 0
fi

# Check each claimed issue for new comments/replies
i=0
for repo in $REPO_LIST; do
    i=$((i+1))
    issue=$(echo $ISSUE_LIST | cut -d' ' -f$i)
    my_comment=$(echo $COMMENT_IDS | cut -d' ' -f$i)
    [ -z "$issue" ] && continue
    
    COMMENTS=$(curl -s --max-time 15 "https://api.github.com/repos/${repo}/issues/${issue}/comments" \
        -H "Authorization: token ${GITHUB_PAT}" 2>/dev/null)
    
    NEW_REPLIES=$(echo "$COMMENTS" | python3 -c "
import sys, json, os
data = json.load(sys.stdin)
if not isinstance(data, list): sys.exit(0)
state = {}
if os.path.exists('$STATE_FILE'):
    try: state = json.load(open('$STATE_FILE'))
    except: pass
seen = state.get('$repo/$issue', set())
new_replies = []
for c in data:
    if c.get('id') == $my_comment: continue
    cid = str(c.get('id',''))
    if cid in seen: continue
    if str(c.get('user',{}).get('login','')) != '$GITHUB_USER':
        new_replies.append({
            'id': cid,
            'user': c.get('user',{}).get('login','?'),
            'created': c.get('created_at',''),
            'body': (c.get('body') or '')[:200]
        })
seen.update([str(c.get('id')) for c in data if c.get('id') != $my_comment])
state['$repo/$issue'] = seen
json.dump(state, open('$STATE_FILE','w'))
if new_replies:
    print(json.dumps(new_replies))
" 2>/dev/null)
    
    if [ -n "$NEW_REPLIES" ] && [ "$NEW_REPLIES" != "[]" ]; then
        send_telegram "📬 <b>New reply on our claim!</b>\nRepo: ${repo} #${issue}\nDetails: ${NEW_REPLIES}"
        echo "Reply found on ${repo}#${issue}"
    fi
done

echo "=== Follow-up Complete: $(date -u) ==="
