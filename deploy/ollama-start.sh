#!/bin/sh
# Start ollama serve if not already running, with wake-lock
set -u
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock >/dev/null 2>&1 || true
if pgrep -f 'ollama serve' >/dev/null 2>&1; then
  # already running; ensure we stay alive by sleeping
  while pgrep -f 'ollama serve' >/dev/null 2>&1; do sleep 60; done
  exec /usr/local/bin/ollama serve
fi
exec /usr/local/bin/ollama serve
