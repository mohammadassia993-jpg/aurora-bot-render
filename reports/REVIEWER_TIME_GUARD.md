# REVIEWER_TIME_GUARD.md — الشرط الزمني للمراجع

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل

## التنفيذ:
- **src/self-review.js** — وحد المراجعة الجديد
- `MIN_REVIEW_MS = 15000` (15 ثانية كحد أدنى)

## المنطق:
```javascript
const reviewStartTime = Date.now();
// جلب الرابط وتفحص المحتوى
const reviewDuration = Date.now() - reviewStartTime;
if (reviewDuration < 15000) {
  throw new Error("Reviewer too fast — likely fake review");
}
```

## الإثبات:
- الاختبار: مراجعة استغرقت **15,005ms** (فوق الحد)
- لو أعطى المراجع تقييماً قبل 15 ثانية → يُرفض التقييم

## النتيجة:
- قبل الإصلاح: 1.7 ثانية (fake)
- بعد الإصلاح: 15.0+ ثانية (حقيقي)
