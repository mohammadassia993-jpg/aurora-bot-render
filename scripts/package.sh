#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
tar --exclude='./data' --exclude='./logs' --exclude='./backups' --exclude='./.env' --exclude='./dist' --exclude='./node_modules' --exclude='./.git' \
  -czf dist/silent-giants-platform.tar.gz .
printf 'Created %s\n' dist/silent-giants-platform.tar.gz
