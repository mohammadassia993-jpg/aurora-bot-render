# REVIEWER_LOOP.md — المراجع التلقائي

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل فوراً عند أي تنفيذ "reviewing"

## المنطق (runReviewer):
1. يستلم أول فرصة بحالة "reviewing"
2. يقيّم من 1 إلى 10:
   - هل الحل كامل؟ (submitted == true)
   - هل يستوفي المتطلبات؟ (comment_id موجود)
   - هل يمكن تحسينه؟ (reviewer_notes)
3. القرار:
   - score ≥ 7 → "approved"
   - score < 7 → "rejected" (يعود للمخطط)

## الإثبات:
- فرصة Latvian quickstart: score 8/10 → APPROVED
- التعليق مع السجل الكامل في pipeline.json

## معايير التقييم:
| المعيار | الوزن |
|---------|-------|
| Submission posted | حاسم |
| Comment ID موجود | حاسم |
| تفاصيل الحل | إضافي |
