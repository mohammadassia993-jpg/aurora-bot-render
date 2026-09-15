# SecureSignatureContract → GitHub Advisory Conversion

**Date:** 2026-09-15
**Status:** ✅ Advisory Draft Complete

## What Was Done
1. Searched all major audit platforms — contract not found anywhere
2. Converted Immunefi PoC into GitHub Security Advisory format
3. Advisory ready for submission via GitHub's private vulnerability reporting

## Advisory Details
- **Title:** Missing Authorization Check in `authorizeUser()` Allows Any Address to Be Authorized
- **Severity:** High
- **Type:** CWE-862 (Missing Authorization)
- **Repo:** `github.com/axie10/off-chain-signatures`

## Files
- Full advisory: `reports/SECURESIG_GITHUB_ADVISORY.md`
- PoC: `deliverables/immunefi-poc/SecureSignatureAttack.t.sol`

## How to Submit
1. Go to `https://github.com/axie10/off-chain-signatures/security/advisories/new`
2. Fill in the advisory details from `SECURESIG_GITHUB_ADVISORY.md`
3. Attach the PoC file
4. Submit as private vulnerability report
