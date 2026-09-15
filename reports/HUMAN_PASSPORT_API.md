# HUMAN_PASSPORT_API.md — Human Passport API Status
**Date:** 2026-09-15
**Status:** ⚠️ API reachable — needs developer portal account (manual signup)

## What was tested
| Tool/Endpoint | Result |
|---|---|
| `https://api.passport.xyz/v2/status` | ✅ HTTP 401 (reachable, requires API key) |
| `https://app.passport.xyz` | ✅ HTTP 200 (reachable via curl) |
| `@wefi-ai/ekyc-suite-mcp` v1.2.14 | ✅ INSTALLED (real npm package, 21 versions) |
| eKYC `.env` requirements | ⚠️ Needs `EKYC_CLOUD_ENDPOINT` + `EKYC_CLOUD_API_KEY` (paid cloud backend) |
| eKYC MCP tools | `face_compare`, `photo_liveness_detect`, `id_card_ocr` (all need cloud API) |

## What's needed (cannot be automated from here)
1. **Passport Scorer API key**: Register at https://docs.passport.xyz → Developer Portal → get Scorer ID + API Key
2. **A wallet with stamps**: Create/recover EVM wallet → link GitHub, Discord, Twitter stamps at app.passport.xyz
3. **eKYC cloud backend**: Requires WeFi-AI cloud account credentials (separate paid service)

## Path forward
- `api.passport.xyz` is a live API — once the leader registers and provides the Scorer ID + API key, the team can programmatically verify scores
- eKYC tools (face_compare, id_card_ocr) need a WeFi-AI cloud endpoint — this is an infrastructure prerequisite
- **No workaround**: passport.xyz registration requires browser + wallet connection + OAuth stamp linking
