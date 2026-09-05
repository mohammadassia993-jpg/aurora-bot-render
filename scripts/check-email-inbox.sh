#!/bin/bash
# Check email inbox for responses
TOKEN=$(curl -s -X POST "https://api.mail.tm/token" \
  -H "Content-Type: application/json" \
  -d '{"address":"silentgiants-team@emalupe.com","password":"SgBot2026!x"}' 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

MESSAGES=$(curl -s "https://api.mail.tm/messages" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
messages = data.get('hydra:member', data) if isinstance(data, dict) else data
count = len(messages) if isinstance(messages, list) else 0
print(count)
" 2>/dev/null)

echo "$(date): Inbox has $MESSAGES messages"
