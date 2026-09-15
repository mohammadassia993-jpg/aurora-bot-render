# HUMAN_PASSPORT_MODELS.md — Human Passport Models API Status
**Date:** 2026-09-15
**Status:** ⚠️ API endpoint confirmed alive — requires API key from developer portal

## What was tested
| Step | Result |
|---|---|
| `developer.passport.xyz` | ✅ HTTP 200 — Next.js frontend loads |
| `api.passport.xyz/v2/models/score/<address>` | ✅ Returns `{"error":"Invalid API Key"}` (endpoint exists) |
| `api.passport.xyz/v2/status` | ✅ HTTP 401 (requires API key) |
| API docs discovery | Not yet accessible (requires developer portal account) |

## Why we cannot complete this task
- `developer.passport.xyz` is a **browser-only** registration page (React/Next.js SPA)
- Registration requires email verification + OAuth (Google/GitHub)
- We confirmed the endpoint `api.passport.xyz/v2/models/score/0x...` is live (returns "Invalid API Key", not 404)
- Once a key is obtained, the team can call: `curl -H "X-API-KEY: <key>" "https://api.passport.xyz/v2/models/score/0x..."`

## Required from leader (one-time, ~3 min)
1. Open `developer.passport.xyz` in browser
2. Register with `auroraalmada4@gmail.com` (existing team email)
3. Create a Scorer + get the API key
4. Share the API key with the team — we will score addresses automatically

## What we will do once we have the key
```bash
# Score any EVM address
curl -s -H "X-API-KEY: <KEY>" "https://api.passport.xyz/v2/models/score/0x..." | jq .
# Result: { "score": 0-100, "stamps": [...] }
# Store in reports/HUMAN_PASSPORT_MODELS.md
```
