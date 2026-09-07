#!/bin/bash
# Pre-deploy check — catches syntax errors before pushing to GitHub/Render
set -e
cd "$(dirname "$0")/.."

echo "🔍 Pre-deploy checks..."

# 1. Syntax check all JS files
FAIL=0
for f in src/*.js scripts/*.js; do
  [ -f "$f" ] || continue
  if ! node -c "$f" 2>/dev/null; then
    echo "❌ SYNTAX ERROR: $f"
    FAIL=1
  fi
done

if [ $FAIL -eq 1 ]; then
  echo "❌ Pre-deploy FAILED: fix syntax errors before pushing"
  exit 1
fi

# 2. Check for ESM issues (await outside async, require in ESM)
for f in src/*.js; do
  if grep -q "require(" "$f" 2>/dev/null; then
    echo "⚠️  WARNING: 'require()' found in $f (ESM project — use import)"
  fi
done

echo "✅ All pre-deploy checks passed"
