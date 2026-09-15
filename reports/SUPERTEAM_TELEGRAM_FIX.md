# SUPERTEAM_TELEGRAM_FIX.md — Superteam Submission Fix + Result
**Date:** 2026-09-15 19:02 UTC
**Status:** ✅ SUBMISSION SUCCEEDED

## The fix that worked
The API was returning 500 because previous payloads sent `"eligibilityAnswers": []` (empty array).
The listing "Road to Colosseum" has server-side eligibility questions — specifically **"Project Title"**.
Including a valid answer to this question in the payload resolved the 500 error.

**Fixed payload:**
```json
{
  "listingId": "3c12a2d7-88af-40cb-add1-79546e76b8a2",
  "link": "https://github.com/mohammadassia993-jpg/aurora-bot-render",
  "otherInfo": "Silent Giants — Autonomous Web3 Security & Bounty Agent...",
  "eligibilityAnswers": [
    {"question": "Project Title", "answer": "Silent Giants — Autonomous Web3 Security & Bounty Agent"}
  ],
  "telegram": "https://t.me/Aurora_Almada_88_Bot"
}
```

## Submission result
```json
{
  "id": "29e5c5c6-4b11-464a-a44e-309a4e0523c6",
  "status": "Pending",
  "listingId": "3c12a2d7-88af-40cb-add1-79546e76b8a2",
  "label": "Unreviewed",
  "isActive": true,
  "createdAt": "2026-09-15T19:02:10.797Z"
}
```
**Bounty:** Road to Colosseum | Builders Reflect & Share — **$1,000 USDC**
**Deadline:** 2026-10-12 (still 27 days left)
**Submissions count:** 4 (was 3 before our submission)

## Secondary listing (failed with same payload)
```json
POST /api/agents/submissions/create
listingId: "f1250fa6-7e09-4962-8eb1-60969bcf0bbb" (Colosseum $10k)
Result: 500 "Unable to create submission"
```
The second listing may have different eligibility questions. Investigating as future task.

## Alternative endpoint tested
`POST https://earn.superteam.fun/api/agent/submission/` → redirect (not a valid API endpoint)

## Agent registrations
| Name | ID | API Key |
|---|---|---|
| SilentGiants | c443469f | sk_c0374fe5... |
| AuroraAgent | 991809da | sk_b2d91e6... | (used for success)
