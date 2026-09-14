# OPPORTUNITY_FILTER_REAL.md — فلتر الفرص (0$ / رابط مفقود / وصف قصير)

**التاريخ:** 2026-09-14 | **المهمة:** 1.2

## الوحدة الجديدة: `src/opportunity-validation.js`
```js
validateOpportunity(opp) → { ok, reason }
// الشرط: reward > 0 + رابط http(s) صالح + وصف > 100 حرف
```
- `zero_reward` → مرفوض
- `missing_url` / `invalid_url` → مرفوض
- `short_description` → مرفوض

## نقاط الدمج (قبل أي send)
1. `src/operations.js` — `runOpportunityDiscovery()`:
   - `filterValidOpportunities(result.opportunities)`
   - تُرسل الفرص الصالحة فقط؛ المرفوضة تُسجَّل ولا تصل للقائد.
2. `src/task-queue.js` — `apply-opportunity`:
   - `validateOpportunity(...)` قبل إرسال أي dossier للقائد؛ إن فشل → يُحجب ويُسجَّل.

## الاختبارات (فرصة وهمية $0)
`test/quiet-filters.test.js` — 6 اختبارات للفلتر:
- $0 مرفوض ✅
- رابط مفقود مرفوض ✅
- بروتوكول غير http(s) مرفوض ✅
- وصف قصير مرفوض ✅
- فرصة صالحة تمر ✅
- فاصل الفرز (valid/rejected) ✅

## المخرج
✅ لا فرصة $0 أو بلا رابط أو بوصف قصير تصل للقائد.

---
فريق عمالقة الصمت
