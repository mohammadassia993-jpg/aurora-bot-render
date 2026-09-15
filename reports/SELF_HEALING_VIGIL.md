# SELF_HEALING_VIGIL.md — VIGIL Self-Healing Supervisor
**Date:** 2026-09-15
**Status:** ✅ VIGIL operational

## What was built
**File:** `src/self-healing-supervisor.js` (347 lines)
**Standalone daemon:** `node src/self-healing-supervisor.js`
**Importable:** `import { VigilSupervisor } from './self-healing-supervisor.js'`

## How it works
1. **Monitor:** every 60s checks last activity (platform.log mtime, health-state.json, internal state)
2. **Detect stall:** if last activity > 5 minutes → STALL detected
3. **Root-cause analysis:** reads last 10 failures from `logs/failures.log`
4. **Rule lookup:** matches error against `data/rules.json` (18 rules) + recovery map
5. **Recovery actions:**
   - `alt_path` — queue alternative task for next cycle (rule 12/1/2: AUTO_RETRY)
   - `retry` — queue retry with backoff (rule 14: NO_SLEEP)
   - `skip_task` — move to next task (rule 1: NOT_FOUND_RECOVERY)
   - `restart_component` — restart stalled component (rule 11)
   - `alert_leader` — notify via Telegram after 5 consecutive failures (rule 9)
   - `log_only` — record unclassified errors
6. **Persistence:** writes state to `data/vigil-state.json`, log to `logs/vigil.log`

## Recovery map (error → action)
| Error pattern | Action | Rule |
|---|---|---|
| timeout / ECONNRESET / network | ALT_PATH | 12 AUTO_RETRY |
| captcha / turnstile / waf | ALT_PATH | 1 NOT_FOUND_RECOVERY |
| not found / 404 | SKIP_TASK | 1 NOT_FOUND_RECOVERY |
| unauthorized / 401 / 403 | ALERT_LEADER | 9 NO_WAITING |
| 500 / internal server | ALT_PATH | 2 PLAYWRIGHT_FIRST |
| rate limit / 429 | RETRY | 14 NO_SLEEP |
| permission / EACCES | RESTART_COMPONENT | 11 VERIFY_COMPATIBILITY |

## Test result (2026-09-15)
```
[VIGIL:info] VIGIL supervisor started (interval: 60s, stall threshold: 300s)
[VIGIL:warn] STALL detected (136414s since last activity)
[VIGIL:info] stall without failures — scheduling retry
[VIGIL:warn] recovery triggered: stall without explicit failure — AUTO_RETRY
[VIGIL:info] RETRY: scheduling retry for next cycle
```
✅ Detects stall → classifies → executes recovery → logs → no leader intervention required

## Deployment
Add to `Procfile` / `start.sh` to keep VIGIL alive alongside the bot:
```
node src/self-healing-supervisor.js &
```
