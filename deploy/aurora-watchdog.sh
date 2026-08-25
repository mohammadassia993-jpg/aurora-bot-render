#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/watchdog.log"
URL="http://127.0.0.1:${PORT:-8787}/health"
mkdir -p "$ROOT/logs"
termux-wake-lock >/dev/null 2>&1 || true
failures=0
while true; do
  if curl -fsS --max-time 12 "$URL" >/dev/null 2>&1; then
    failures=0
  else
    failures=$((failures + 1))
    echo "$(date -Is) health failed ($failures)" >> "$LOG"
    if [ "$failures" -ge 2 ]; then
      OLD_PID=$(node -e "try{process.stdout.write(String(require('$ROOT/service-pids.json').platform||''))}catch{}" 2>/dev/null || cat "$ROOT/platform.pid" 2>/dev/null || true)
      if [ -n "$OLD_PID" ] && [ -d "/proc/$OLD_PID" ]; then
        kill "$OLD_PID" 2>/dev/null || true
        echo "$(date -Is) killed unhealthy supervised platform pid=$OLD_PID; supervisor will restart it" >> "$LOG"
      else
        echo "$(date -Is) platform process absent; supervisor owns recovery" >> "$LOG"
      fi
      failures=0
    fi
  fi
  sleep 30
done
