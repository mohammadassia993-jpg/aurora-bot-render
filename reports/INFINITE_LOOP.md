# INFINITE_LOOP.md — الحلقة اللانهائية

**التاريخ:** 2026-09-15
**الحالة:** ✅ تعمل في scheduler.js

## الجدولة:
| المهمة | التكرار |
|--------|---------|
| Researcher (مستخبر) | كل 5 دقائق |
| Pipeline loop (مخطط→منفذ→مراجع→منسق) | كل دقيقة |
| Bounty Watcher | كل 5 دقائق |
| Follow-up | كل 15 دقيقة |

## الحلقة (كل دقيقة):
```
pipeline.json
  ├─ new → runPlanner → planned
  ├─ planned → runExecutor → reviewing
  ├─ reviewing → runReviewer → approved/rejected
  └─ approved/rejected → runOrchestrator → تقرير
```

## شروط عدم التوقف:
- كل دقيقة: فحص كامل لجميع المراحل
- حتى 3 فرص لكل مرحلة في كل دورة
- لا نوم. لا انتظار. الحلقة دائماً نشطة.

## الإثبات:
PIPELINE_TEST.md — فرصة كاملة: new → approved خلال 1.7 ثانية
