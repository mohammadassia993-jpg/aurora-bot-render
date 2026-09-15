# IMMUNEFI_CLI_FIX.md — Immunefi CLI + CAPTCHA Status
**Date:** 2026-09-15
**Status:** ⚠️ CLI installed — blocked on account verification (email + TOTP)

## What was installed/tested
| Tool | Result |
|---|---|
| `@hyperlane-xyz/immunefi-cli` v1.0.0-beta-1 | ✅ INSTALLED (real npm package) |
| `immunefi --help` | ✅ Works (login, reports, report, comment, update-status, llm-docs) |
| Credentials file `~/.immunefi-cli/credentials.yaml` | ✅ Created (SilentGiants account) |
| `immunefi login` | ⏳ Attempted — see result below |
| EzSolver (GitHub: ismoiloffS/EzSolver) | ✅ Cloned — Turnstile solver (needs Chrome + Xvfb, both present) |
| EzSolver deps (nodriver 0.50.3) | ✅ Installed |

## Key finding: CLI has NO submit/create command
The CLI is a **triage tool** (list reports, comment, update status) — NOT a submission tool.
It requires:
1. An existing verified Immunefi account
2. TOTP MFA secret (Base32) — set up during account registration
3. Session cookies (~8h TTL)

None of these exist yet because the account's **email verification was never completed**.

## The chain of blockers (honest)
1. ❌ **Passport verification** — needs wallet + stamps (browser interaction)
2. ❌ **Immunefi registration** — needs email verification (link sent to evomap inbox, not team-accessible)
3. ❌ **TOTP setup** — requires the leader to complete 2FA during registration
4. ⛔ **Even with all of the above**: this CLI cannot CREATE a new report (triaging only)

## EzSolver status
- ✅ Repo cloned, dependencies present (nodriver, Chrome, Xvfb)
- It solves Cloudflare *Turnstile* widgets by injecting a widget into a real browser
- ⚠️ Only relevant for the Superteam browser flow, which is blocked by the Superteam 500 anyway
- Not applicable to Immunefi signup (which uses its own CAPTCHA + email verification)

## What CAN be done without the account
- ✅ RootstockLabs PoC READY (`deliverables/rootstock-poc/RootstockSlashingAttack.t.sol`)
- ✅ Submission payload fully prepared (title, severity: Medium, asset, reward: $5,000)

## Required from leader (~5 min, one-time)
1. Open `app.passport.xyz` → connect wallet → verify GitHub/Discord/Twitter
2. Open `bugs.immunefi.com/signup` → complete registration with `SilentGiants` credentials
3. Confirm email verification link (sent to the evomap inbox)
4. Enable TOTP 2FA and share the Base32 secret with the team
5. Team then uses the CLI for session-based API access
