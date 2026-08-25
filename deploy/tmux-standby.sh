#!/usr/bin/env bash
set -u

ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
cd "$ROOT"
mkdir -p logs

while true; do
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
  if ! pgrep -f '^/usr/local/bin/node scripts/runtime-supervisor.js$|^node scripts/runtime-supervisor.js$' >/dev/null 2>&1; then
    echo "$(date -Is) supervisor absent; starting recovery from tmux standby" >> logs/tmux-standby.log
    exec bash deploy/runtime-supervisor.sh
  fi
  sleep 30
done
