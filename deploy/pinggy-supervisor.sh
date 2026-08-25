#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/pinggy-supervisor.log"
mkdir -p "$ROOT/logs" "$ROOT/data"
cd "$ROOT"
set -a
. ./.env
set +a

failures=0
while true; do
  url=''
  if [ -f "$ROOT/data/tunnel.json" ]; then
    url=$(node -e "try{process.stdout.write(require('$ROOT/data/tunnel.json').url||'')}catch{}")
  fi
  if [ -n "$url" ] && curl -fsS --max-time 8 "$url/health" >/dev/null 2>&1; then
    failures=0
  else
    failures=$((failures + 1))
    echo "$(date -Is) Pinggy health failed ($failures)" >> "$LOG"
  fi

  if [ "$failures" -ge 2 ]; then
    echo "$(date -Is) restarting Pinggy tunnel" >> "$LOG"
    if [ -f "$ROOT/tunnel.pid" ]; then
      kill "$(cat "$ROOT/tunnel.pid")" 2>/dev/null || true
    fi
    PORT="${PORT:-8787}" SILENT_GIANTS_ROOT="$ROOT" "$ROOT/deploy/aurora-tunnel.sh" >> "$LOG" 2>&1 || true
    failures=0
  fi
  sleep 30
done
