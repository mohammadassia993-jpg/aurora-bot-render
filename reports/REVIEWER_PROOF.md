# REVIEWER_PROOF.md — التوثيق الإلزامي للمراجع

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل

## التنفيذ:
- قبل أي تقييم، المراجع يحفظ ملف إثبات في `data/reviews/{opp_id}.json`

## محتويات ملف الإثبات:
```json
{
  "opp_id": "opp_537994_8j3y",
  "link": "https://github.com/BasedHardware/omi/issues/13882",
  "review_duration_ms": 15005,
  "fetched": { "status": 200, "finalUrl": "..." },
  "comment_text": "https://github.com/...",
  "score": 7,
  "reason": "Submission posted (comment #...). Review took 15s."
}
```

## الإلزام:
- لا يوجد ملف إثبات → التقييم لاغٍ
- المراجع لا يستطيع إكمال المراجعة بدون حفظ الدليل

## الإثباتات المحفوظة:
- `data/reviews/opp_537994_8j3y.json` ✅
