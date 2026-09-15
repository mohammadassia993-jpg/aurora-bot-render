# SHARED_STATE.md — الحالة المشتركة (pipeline.json)

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل

## الملف:
- **data/pipeline.json** — قاعدة الحالة المشتركة
- **src/pipeline.js** — وحدة القراءة/الكتابة (API داخلي)

## البنية:
```json
{
  "opportunities": [
    {
      "id": "opp_888468_om8n",
      "title": "...",
      "link": "...",
      "reward": 25,
      "status": "new|planned|executing|reviewing|approved|rejected",
      "researcher_notes": "...",
      "planner_plan": {...},
      "executor_result": {...},
      "reviewer_score": 8,
      "reviewer_notes": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "meta": { "total_processed": 1, "total_approved": 1 }
}
```

## الوكلاء الخمسة يقرأون ويكتبون نفس الملف:
- المستخبر: addOpportunity()
- المخطط: updateOpportunity(status: planned)
- المنفذ: updateOpportunity(status: reviewing)
- المراجع: updateOpportunity(status: approved/rejected)
- المنسق: getStats() + تقرير
