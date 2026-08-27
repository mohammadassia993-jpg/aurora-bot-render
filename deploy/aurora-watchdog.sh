#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
LOG="$ROOT/logs/watchdog.log"
URL="http://127.0.0.1:${PORT:-8787}/health"
mkdir -p "$ROOT/logs"
termux-wake-lock >/dev/null 2>&1 || true
# Only restart the platform when it is truly unreachable (connection-level failure),
# not when /health reports a transient component degradation (HTTP 503).
failures=0
while true; do
  if curl -sS --max-time 12 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null | grep -q "^200"; then
    failures=0
  else
    failures=$((failures + 1))
    echo "$(date -Is) health degraded/unreachable ($failures)" >> "$LOG"
    if [ "$failures" -ge 4 ]; then
      OLD_PID=$(node -e "try{process.stdout.write(String(require('$ROOT/service-pids.json').platform||''))}catch{}" 2>/dev/null || cat "$ROOT/platform.pid" 2>/dev/null || true)
      if [ -n "$OLD_PID" ] && [ -d "/proc/$OLD_PID" ]; then
        kill "$OLD_PID" 2>/dev/null || true
        echo "$(date -Is) killed unreachable supervised platform pid=$OLD_PID; supervisor will restart it" >> "$LOG"
      else
        echo "$(date -Is) platform process absent; supervisor owns recovery" >> "$LOG"
      fi
      failures=0
    fi
  fi
  sleep 30
done
