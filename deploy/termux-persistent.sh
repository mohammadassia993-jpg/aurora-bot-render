#!/usr/bin/env bash
set -euo pipefail

ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
MODE="${1:-ensure}"
SESSION="silent-giants"

cd "$ROOT"
mkdir -p logs
if ! command -v termux-wake-lock >/dev/null 2>&1; then
  command -v pkg >/dev/null 2>&1 && pkg install -y termux-api
fi
if ! command -v tmux >/dev/null 2>&1; then
  command -v pkg >/dev/null 2>&1 && pkg install -y tmux
fi
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
command -v tmux >/dev/null 2>&1 || { echo "tmux is required" >&2; exit 1; }

if pgrep -f '^/usr/local/bin/node scripts/runtime-supervisor.js$|^node scripts/runtime-supervisor.js$' >/dev/null 2>&1; then
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux new-session -d -s "$SESSION" -c "$ROOT" \
      "bash '$ROOT/deploy/tmux-standby.sh' 2>&1 | tee -a '$ROOT/logs/tmux-standby.log'"
  fi
else
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux new-session -d -s "$SESSION" -c "$ROOT" \
      "bash '$ROOT/deploy/runtime-supervisor.sh' 2>&1 | tee -a '$ROOT/logs/runtime-supervisor.log'"
  fi
fi

if [[ "$MODE" == "--foreground" ]]; then
  while tmux has-session -t "$SESSION" 2>/dev/null; do sleep 60; done
fi
