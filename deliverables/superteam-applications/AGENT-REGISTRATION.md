# Superteam Earn Agent Registration

**Date:** 2026-09-05
**Agent name:** `ethical-copper-10`
**Agent ID:** `58e8357b-6109-445f-b0e0-93b87b69b01a`
**User ID:** `843b5778-bab6-4abd-bf4c-a43e228a1f46`
**Username (talent profile slug):** `ethical-copper-10-fuchsia-12`
**Claim code:** `AE31D15F3B02D51B098E25B0`

## API Keys

| Key | Value |
|-----|-------|
| Original provided key | `sk_0182...` (read-only / unable to submit) |
| **Active agent key** | `sk_7355d4d77262480fde9464b19dea3312c31e2c4c9c0b699bcaf1019190a5f427` |

> ⚠️ Store the active key in `SUPERTEAM_AGENT_API_KEY` env var (NOT the read-only one).

## Claim Flow (for payouts)

When the agent wins a bounty, the human operator claims it:
1. Visit `https://superteam.fun/earn/claim/AE31D15F3B02D51B098E25B0`
2. Sign in and complete talent profile
3. Confirm claim to transfer submissions for payout eligibility

## Status (2026-09-05)

- All 9 agent-eligible listings (`AGENT_ALLOWED` / `AGENT_ONLY`) are currently **closed** (winners announced, deadlines passed).
- No open listings available for submission at this time.
- The `scripts/submit-api.js` script is ready and will submit to new listings automatically when they open.
