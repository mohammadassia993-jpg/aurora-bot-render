# SUPERTEAM_MCP.md — Earn Bounty Scanner Status
**Date:** 2026-09-15
**Status:** ⚠️ MCP package not on npm — Direct API works

## earn-bounty-scanner MCP Attempt
- **Attempt:** `npx -y earn-bounty-scanner`
- **Result:** ❌ 404 NOT FOUND on npm registry
- The package `earn-bounty-scanner` does not exist on npm

## Alternative: Direct Superteam API (WORKING ✅)
**Endpoint:** `GET https://superteam.fun/api/agents/listings/live?take=20`
**Auth:** Bearer `sk_b2d91e6005fd2702bd101823251ecfc7e80f7283b8e31fefd891297c0f6de9bc`
**Status:** ✅ WORKS — live listings retrieved

### Live Listings Found (2 OPEN, 9 with winners announced):
| Reward | Title | Access | Deadline | Status |
|--------|-------|--------|----------|--------|
| $1,000 USDC | Road to Colosseum: Builders Reflect & Share | AGENT_ALLOWED | 2026-10-12 | OPEN |
| $10,000 USDG | Colosseum Crypto World's Fair Hackathon (Vietnam) | AGENT_ALLOWED | OPEN | OPEN |
| $5,000 | Build Superteam Brazil LMS dApp | AGENT_ALLOWED | 2026-03-05 | Winners announced (still OPEN) |
| $5,000 | Open Innovation Track: Build on Solana | AGENT_ONLY | 2026-02-15 | Winners announced |
| $3,500 | Narrative detection tool | AGENT_ONLY | 2026-02-15 | Winners announced |
| $3,000 | Audit & Fix Open-Source Solana Repos | AGENT_ONLY | 2026-02-15 | Winners announced |
| $1,000 | Rebuild backend as Rust programs | AGENT_ALLOWED | 2026-03-16 | Winners announced |

## Submission Attempt (2026-09-15 18:30 UTC)
**Endpoint:** `POST /api/agents/submissions/create`
**Result:** ❌ 2/2 FAILED — 500 `"Unable to create submission."` (server-side error, not our key — reproduced with all 3 registered agent keys)

### Key Findings
- ✅ API discovery works without Cloudflare (no browser needed)
- ✅ 2 agent keys registered (SilentGiants, AuroraAgent)
- ❌ Submission endpoint returns 500 for ALL keys — Superteam's server-side bug
- The 404 on earn-bounty-scanner means the MCP package was hypothetical

## Alternative Paths (documented)
1. Apify Superteam scraper (requires paid plan) — NOT used
2. Browser submission (requires Twitter OAuth login) — Cloudflare blocked
3. **Recommended:** Track the 2 OPEN listings; retry submission API when Superteam fixes the 500 error
