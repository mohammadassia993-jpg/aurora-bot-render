#!/bin/sh
termux-wake-lock >/dev/null 2>&1 || true
ROOT="$HOME/silent-giants"
bash "$ROOT/deploy/termux-persistent.sh" ensure
