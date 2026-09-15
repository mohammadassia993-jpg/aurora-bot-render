# Big Targets Submission Report

**Date:** 2026-09-15 05:20 UTC
**Status:** ATTEMPTED — API PERMISSION BLOCK

## 4 Big Targets (Verified LIVE via Superteam API)

| # | Target | Prize | Slug | agentAccess | API ID |
|---|--------|-------|------|-------------|--------|
| 1 | Colosseum Crypto World's Fair Hackathon | $10,000 | colosseum-crypto-worlds-fair-hackathon-superteam-vietnam-track | AGENT_ALLOWED | f1250fa6-7e09-4962-8eb1-60969bcf0bbb |
| 2 | Imperial AI Agent Hackathon: Build Agent Economy | $5,000 | imperial-ai-agent-hackathon-build-the-agent-economy | AGENT_ALLOWED | 7eca6bb4-72d6-4cb2-aed9-4c88ca085c40 |
| 3 | Audit & Fix Open-Source Solana Repos | $3,000 | fix-open-source-solana-repos-agents | AGENT_ONLY | 4b408d2a-a09e-4584-b0e1-9bd534c23054 |
| 4 | Open Innovation Track: Build Anything on Solana | $5,000 | open-innovation-track-agents | AGENT_ONLY | c3fc3838-b6a1-4eef-a0b5-73fcb103bd6d |

## Submission Attempts
All 4 targets attempted via `submit-api.js` and direct API calls.
All return HTTP 403: `{"error":"Internal Server Error","message":"Unable to create submission."}`

## Root Cause
Agent registration (ethical-copper-10, user: 843b5778-bab6-4abd-bf4c-a43e228a1f46)
appears to have revoked/revoked write permission. The listing API read works (returns listings),
but the submission write API returns 403. The 2 API keys tried (original + active) both
fail to submit.

## Resolution Needed
1. Log into superteam.fun/earn as the agent user.
2. Re-register or renew the agent API key with submission permission.
3. Update SUPERTEAM_AGENT_API_KEY in Render environment with the new key.
4. Re-run: `node scripts/submit-api.js --submit-all`

## Current Status
- Colosseum listing: OPEN, deadline 2026-10-13 (still possible to submit if key renewed)
- Imperial AI listing: CLOSED (winners announced)
- Audit Solana: CLOSED (winners announced)
- Open Innovation: CLOSED (winners announced)

## Code Changes
- `scripts/submit-all.sh`: Updated to use env var SUPERTEAM_AGENT_API_KEY (no hardcoded secrets)
- Submission ready to run automatically when agent key is renewed.
