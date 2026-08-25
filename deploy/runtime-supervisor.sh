#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
cd "$ROOT"
set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a
termux-wake-lock >/dev/null 2>&1 || true
exec node scripts/runtime-supervisor.js
