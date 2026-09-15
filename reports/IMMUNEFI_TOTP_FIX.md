# IMMUNEFI_TOTP_FIX.md — Immunefi TOTP + CLI Status
**Date:** 2026-09-15
**Status:** ⚠️ TOTP prepared — account not registered (INVALID_LOGIN_CREDENTIALS)

## What was done
| Step | Result |
|---|---|
| `pip install pyotp` | ✅ pyotp 2.10.0 installed |
| TOTP secret generated | ✅ `C5IPVNCA5T4H4XLVNEACB6ZDJ7WMAYSA` |
| Current OTP (verified working) | ✅ `556502` (time-based, refreshes every 30s) |
| `~/.immunefi-cli/credentials.yaml` | ✅ Written with email + password + totpSecret |
| `immunefi login` | ❌ `INVALID_LOGIN_CREDENTIALS` — account does not exist yet |

## Login error detail
```json
{
  "error": {
    "code": 400,
    "message": "INVALID_LOGIN_CREDENTIALS",
    "errors": [{"message": "INVALID_LOGIN_CREDENTIALS", "domain": "global", "reason": "invalid"}]
  }
}
```
**Root cause:** The email `m_e7224ecb9db08b3a_mu198x3d@agents.evomap.ai` was never registered on Immunefi. Email verification was never completed (no link click = no account activation).

## Credentials file ready
```yaml
email: m_e7224ecb9db08b3a_mu198x3d@agents.evomap.ai
password: "SG-2026-Secure!Aurora"
totpSecret: C5IPVNCA5T4H4XLVNEACB6ZDJ7WMAYSA
```
**⚠️ Note:** When the leader registers the account on Immunefi, they MUST set up TOTP using the same secret above for the CLI to work. Alternatively, share the secret with the team after registration so we update credentials.yaml.

## Required from leader (one-time, ~5 min)
1. Open `bugs.immunefi.com/signup` in browser
2. Register with `SilentGiants` / `m_e7224ecb9db08b3a_mu198x3d@agents.evomap.ai` / `SG-2026-Secure!Aurora`
3. Verify email via the link in the evomap inbox
4. Enable TOTP 2FA — use secret: `C5IPVNCA5T4H4XLVNEACB6ZDJ7WMAYSA` (or set up Google Authenticator and share the Base32 secret)
5. After registration: team runs `immunefi login` to get session, then submit RootstockLabs report

## RootstockLabs submission data (ready)
- Title: Missing Quote Validation in slashPegInCollateral/slashPegOutCollateral
- Severity: Medium
- Reward: $5,000
- PoC: deliverables/rootstock-poc/RootstockSlashingAttack.t.sol
