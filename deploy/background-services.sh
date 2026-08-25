#!/bin/sh
set -u
ROOT="${SILENT_GIANTS_ROOT:-$HOME/silent-giants}"
cd "$ROOT"
exec bash deploy/termux-persistent.sh --foreground
