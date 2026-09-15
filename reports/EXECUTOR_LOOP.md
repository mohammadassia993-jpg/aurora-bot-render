# EXECUTOR_LOOP.md — المنفذ التلقائي

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل فوراً عند أي خطة "planned"

## المنطق (runExecutor):
1. يستلم أول فرصة بحالة "planned"
2. يحدّث: "executing"
3. ينفذ حسب نوع الرابط:
   - GitHub issue → ينشر تعليق Claim تلقائياً عبر API
   - منصات أخرى → playwright-mcp + @useagentstore/solve
4. يحفظ النتيجة (submitted, comment_id, url)
5. يحدّث: "reviewing"

## الإثبات الحقيقي:
- تم نشر تعليق فعلي على BasedHardware/omi#13883
- Comment ID: 5674794773
- URL: https://github.com/BasedHardware/omi/issues/13883#issuecomment-5674794773

## السرعة:
- من "planned" إلى "reviewing": ~1.5 ثانية (شامل مكالمة GitHub API)
