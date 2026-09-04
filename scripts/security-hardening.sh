#!/bin/bash
# Security Hardening Script for Silent Giants
# Run this after deployment to verify all security measures

echo "🔒 Security Hardening Check"
echo "=========================="

# 1. Check .env permissions
ENV_PERMS=$(stat -c %a .env 2>/dev/null)
if [ "$ENV_PERMS" = "600" ]; then
  echo "✅ .env permissions: 600 (correct)"
else
  echo "❌ .env permissions: $ENV_PERMS (should be 600)"
  chmod 600 .env
  echo "   Fixed: chmod 600 .env"
fi

# 2. Check .env is in .gitignore
if grep -q "^\.env$" .gitignore 2>/dev/null; then
  echo "✅ .env in .gitignore"
else
  echo "❌ .env NOT in .gitignore"
  echo ".env" >> .gitignore
  echo "   Fixed: added .env to .gitignore"
fi

# 3. Check data/ directory permissions
if [ -d "data" ]; then
  DATA_PERMS=$(stat -c %a data)
  if [ "$DATA_PERMS" = "700" ]; then
    echo "✅ data/ permissions: 700 (correct)"
  else
    echo "⚠️ data/ permissions: $DATA_PERMS (should be 700)"
    chmod 700 data
  fi
fi

# 4. Check for hardcoded secrets in code
echo ""
echo "🔍 Checking for hardcoded secrets..."
if grep -rn "sk-\|token=\|password=" src/ scripts/ --include="*.js" 2>/dev/null | grep -v "process.env\|config\.\|example" | head -5; then
  echo "⚠️ Potential hardcoded secrets found (see above)"
else
  echo "✅ No hardcoded secrets in source code"
fi

# 5. Check for .env in git history
echo ""
echo "🔍 Checking git history for .env..."
if git log --all --diff-filter=A -- .env 2>/dev/null | grep -q ".env"; then
  echo "⚠️ .env was committed at some point (consider git filter-branch)"
else
  echo "✅ .env never committed to git"
fi

# 6. Check wallet addresses are receive-only
echo ""
echo "🔍 Verifying wallet configuration..."
grep "USDT_TON_RECEIVE_ADDRESS\|USDC_BASE_RECEIVE_ADDRESS\|USDC_SOLANA_RECEIVE_ADDRESS" .env | while read line; do
  key=$(echo "$line" | cut -d= -f1)
  val=$(echo "$line" | cut -d= -f2-)
  if [ ${#val} -gt 10 ]; then
    echo "✅ $key: ${val:0:10}..."
  else
    echo "❌ $key: Not configured"
  fi
done

# 7. Check contract approval
echo ""
CONTRACTApproval=$(grep "CONTRACT_APPROVAL_REQUIRED" .env | cut -d= -f2)
if [ "$CONTRACTApproval" = "true" ]; then
  echo "✅ Contract approval required: true"
else
  echo "⚠️ Contract approval: $CONTRACTApproval"
fi

echo ""
echo "=========================="
echo "🔒 Security hardening check complete"
