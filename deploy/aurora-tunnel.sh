#!/bin/sh
set -eu
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/pinggy.log"
STATE="$ROOT/data/tunnel.json"
PIDFILE="$ROOT/tunnel.pid"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN required}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET required}"
mkdir -p "$ROOT/logs" "$ROOT/data"
: > "$LOG"
setsid ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -p 443 \
  -R0:localhost:${PORT:-8787} a.pinggy.io </dev/null >>"$LOG" 2>&1 &
child=$!
echo "$child" > "$PIDFILE"
url=''
for i in $(seq 1 30); do
  url=$(sed -n 's/.*\(https:\/\/[a-z0-9-]*\.free\.pinggy\.net\).*/\1/p' "$LOG" | tail -1)
  [ -n "$url" ] && break
  kill -0 "$child" 2>/dev/null || exit 1
  sleep 2
done
[ -n "$url" ] || exit 1
node - "$url" "$ROOT" <<'NODE'
const fs=require('node:fs');
const [url,root]=process.argv.slice(2);
const file=`${root}/data/tunnel.json`;
let state={};
try{state=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
state.url=url; state.updatedAt=new Date().toISOString(); state.expiresInHours=60;
fs.writeFileSync(file,JSON.stringify(state,null,2));
NODE
printf '%s\n' "$url"
