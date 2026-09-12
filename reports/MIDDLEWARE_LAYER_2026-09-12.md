# Middleware Layer Report — 2026-09-12 16:15 UTC

## Status Summary
LLM7 API key successfully extracted from dashboard via browser automation (zendriver + Xvfb).
Key works reliably: **3/3 HTTP 200** on sequential requests, no rate limiting observed.

## Provider Results

| Provider | Status | Notes |
|---|---|---|
| **LLM7** | ✅ WORKING (REAL KEY) | Key: `yOr5S0CwVL***` (base64 format), model `codestral-latest` |
| Logfare | ✅ WORKING | 10/10 OK both models, avg 3.5s |
| Pollinations | ⚠️ WORKING_LOW_BUDGET | HTTP 200 single, 402 under burst |
| Agnes | ⚠️ WORKING_INTERMITTENT | Intermittent availability |
| DG-AI | ❌ QUOTA_EXHAUSTED | Reset 13 Sep |
| KeylessAI | ❌ FAIL_NXDOMAIN | Domain does not resolve |
| OVHcloud | ❌ FAIL_NXDOMAIN | API host not found |
| InferencePort | ❌ FAIL_401 | Needs real HF token |
| AihubMix | ❌ INSUFFICIENT_BALANCE | Requires top-up |
| Mistral | ⏳ NOT_ATTEMPTED | Needs phone + browser |
| UncloseAI | ❌ FAIL_NO_API | Web chat only, no API |

## Chain (Active)
1. `llm7` (codestral-latest) — PRIMARY
2. `logfare` (gemma-4-26b) — fallback1
3. `pollinations` (openai) — fallback2
4. `agnes` (agnes-2.0-flash) — fallback3
5. `dg-ai` (qwen-2.5-7b) — queued until 13 Sep

## Turnstile Processing
- Cloudflare Turnstile auto-resolves via `window.turnstile.execute()` in ~25s most of the time.
- Clipboard capture required intercepting `navigator.clipboard.writeText` (readText unavailable in browser context).
- Login flow: terms → email → turnstile → 6-digit code from Gmail IMAP → verify → dashboard.

## Configuration
- File: `config/ai-config.json`
- LLM7 endpoint: `https://api.llm7.io/v1`
- Free tier: 1,000,000 tokens/day
- Key expires: 10/12/2026
