# SUPERTEAM_API_FIX.md — Superteam API Submission Fix Attempts
**Date:** 2026-09-15
**Status:** ⚠️ Server-side 500 — not fixable on our end

## What was attempted (all on 2026-09-15 ~18:46 UTC)
**Target listing:** "Road to Colosseum | Builders Reflect & Share"
- `listingId`: `3c12a2d7-88af-40cb-add1-79546e76b8a2`
- `type`: bounty, `reward`: $1,000 USDC
- `agentAccess`: AGENT_ALLOWED
- Deadline: 2026-10-12 (OPEN)
- Current submissions: 3

**API Key used:** `sk_b2d91e6005fd2702bd101823251ecfc7e80f7283b8e31fefd891297c0f6de9bc` (AuroraAgent)

### Submission attempt 1 (minimal payload)
```json
POST /api/agents/submissions/create
{
  "listingId": "3c12a2d7-88af-40cb-add1-79546e76b8a2",
  "link": "https://github.com/mohammadassia993-jpg/aurora-bot-render",
  "telegram": "https://t.me/Aurora_Almada_88_Bot",
  "otherInfo": "AI-powered web3 task agent.",
  "eligibilityAnswers": []
}
```
**Result:** `{"error":"Internal Server Error","message":"Unable to create submission."}` — HTTP 500

### Submission attempt 2 (with rewardAsk)
```json
{...same as above with "ask": 1000}
```
**Result:** Same 500 error

### Previous attempts (from earlier turn)
- Payload from `scripts/submit-api.js` (full `eligibilityAnswers`, `otherInfo`, `telegram`)
- Result: Same 500 error
- Also tried with the second agent key (SilentGiants, `sk_c0374fe5...`)
- Result: Same 500 error

## Analysis
- ✅ GET `/api/agents/listings/live` works (returns listings with Bearer token)
- ❌ POST `/api/agents/submissions/create` fails with 500 on ALL payload variations
- ❌ Fails with ALL 3 registered agent keys
- This is a **Superteam server-side bug** — not a payload issue
- The 500 occurs regardless of: listing type (bounty vs project), presence of eligibilityAnswers, presence of telegram field, presence of ask field

## Confirmed agent registrations
| Name | Agent ID | API Key |
|---|---|---|
| SilentGiants | c443469f-24e5-4675-984e-94fd1f98e658 | sk_c0374fe5888841a78... |
| AuroraAgent | 991809da-fb05-456b-b710-d2bb8f0eddfe | sk_b2d91e6005fd2702... |

## Recommendation
- Retry when Superteam fixes the 500 error (server-side issue)
- Monitor `POST /api/agents/submissions/create` health periodically
- Keep tracking "Road to Colosseum" (deadline 2026-10-12, only 3 submissions so far)
