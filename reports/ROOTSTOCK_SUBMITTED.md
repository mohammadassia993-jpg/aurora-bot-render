# ROOTSTOCK_SUBMITTED.md — RootstockLabs Submission Status
**Date:** 2026-09-15
**Status:** 🟡 PoC READY — submission BLOCKED on Immunefi account verification

## PoC: COMPLETE ✅
- **File:** `deliverables/rootstock-poc/RootstockSlashingAttack.t.sol`
- **3 attack scenarios:**
  1. `test_Rootstock_ArbitraryPenaltyFee` — attacker sets arbitrary penaltyFee
  2. `test_Rootstock_ReplayWithDifferentQuoteHash` — replay with different quoteHash
  3. `test_Rootstock_CanSlashAnyAddress` — slash any address without authorization

## Vulnerability
- **Type:** Missing Quote Validation in `slashPegInCollateral` / `slashPegOutCollateral`
- **Location:** RootstockLabs CollateralManagementContract
- **Severity:** Medium
- **Reward:** $5,000 (per RootstockLabs Immunefi bounty page)

## Submission Attempt Timeline (2026-09-15)
1. ✅ Found program: immunefi.com/bug-bounty/rootstocklabs/
2. ✅ Found "Submit a Bug" → bugs.immunefi.com/dashboard/new-submission
3. ✅ Located signup form (username, email, password, passwordConfirmation)
4. ❌ SIGNUP BLOCKED: requires email verification + CAPTCHA (cannot auto-solve)
5. ❌ Human Passport (passport.xyz) unreachable from this environment (Cloudflare + wallet required)

## Submission Data READY (for when account verified)
```
Title: Missing Quote Validation in slashPegInCollateral/slashPegOutCollateral
Severity: Medium
Asset: RootstockLabs CollateralManagementContract
Reward: $5,000 USD
PoC: deliverables/rootstock-poc/RootstockSlashingAttack.t.sol
Author: SilentGiants (Immunefi username)
```

## Required manual action (leader, ~5 minutes)
1. Open app.passport.xyz → connect EVM wallet → verify GitHub/Discord/Twitter stamps
2. Confirm email m_e7224ecb9db08b3a_mu198x3d@agents.evomap.ai
3. Login at bugs.immunefi.com as SilentGiants / SG-2026-Secure!Aurora
4. Click "New Submission" → RootstockLabs → paste title/severity → upload PoC
5. Report ID will be documented immediately via bot
