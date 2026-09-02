#!/bin/bash
# One-click submission script for all 9 bounties
# Usage: bash scripts/submit-all.sh

API_KEY="sk_0182978bc38504e97935255b540fbf54b86c9624256a568e9186cc3fad7b3d68"
API_URL="https://superteam.fun/api/agents/submissions/create"
GITHUB_URL="https://github.com/mohammadassia993-jpg/aurora-bot-render"

echo "🎯 Starting submission to all 9 bounties..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List of listing IDs and names
declare -A BOUNTIES
BOUNTIES=(
  ["ba37dab1-ee5c-4817-b016-5faeb28acc14"]="Polish Solana Research (600 USDC)"
  ["9a42cdbf-f931-4560-9663-99afe37e5656"]="Not Your Regular Bounty (3000 jupUSD)"
  ["7eca6bb4-72d6-4cb2-aed9-4c88ca085c40"]="Imperial AI Hackathon (5000 USDG)"
  ["70678a7e-fbce-4566-a2a1-879ab57fc316"]="Superteam Brazil LMS (5000 USDG)"
  ["efd39767-65cf-4183-a96b-7711080e7db3"]="Rebuild Backend Rust (1000 USDC)"
  ["88dbbf01-99b7-4751-8750-48f7941e7dc2"]="Poland Podcast Cover (500 USDC)"
  ["fd499139-21a9-443d-a0fc-cb418f646f0d"]="Narrative Detection (3500 USDG)"
  ["4b408d2a-a09e-4584-b0e1-9bd534c23054"]="Audit Solana Repos (3000 USDG)"
  ["c3fc3838-b6a1-4eef-a0b5-73fcb103bd6d"]="Open Innovation Track (5000 USDG)"
)

SUCCESS=0
FAILED=0

for ID in "${!BOUNTIES[@]}"; do
  NAME="${BOUNTIES[$ID]}"
  echo ""
  echo "📤 Submitting: $NAME"
  
  RESPONSE=$(curl -sL -X POST "$API_URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"listingId\": \"$ID\",
      \"link\": \"$GITHUB_URL\",
      \"otherInfo\": \"Arabic Web3 content - 92 deliverables\"
    }" 2>/dev/null)
  
  if echo "$RESPONSE" | grep -q "error"; then
    echo "  ❌ Failed: $(echo $RESPONSE | python3 -c 'import json,sys; print(json.load(sys.stdin).get("message","unknown"))' 2>/dev/null)"
    ((FAILED++))
  else
    echo "  ✅ Success!"
    ((SUCCESS++))
  fi
  
  sleep 2  # Rate limiting
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Results: $SUCCESS success, $FAILED failed"
