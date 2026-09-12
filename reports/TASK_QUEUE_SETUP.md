# TASK_QUEUE_SETUP.md — بناء قائمة مهام مستمرة 24/7
التاريخ: 2026-09-12 23:20 UTC

---

## ✅ المنفَّذ: `src/task-queue.js` (جديد)

### قاعدة بيانات
- جدول SQLite `task_queue` في `data/platform.db` (يبقى بعد إعادة التشغيل).
- الأعمدة: `id, description, status (pending/active/done), priority, category, result, created_at, updated_at`.

### الدوال
| الدالة | الوظيفة |
|--------|---------|
| `addTask(description, category, priority)` | إضافة مهمة جديدة |
| `nextTask()` | سحب المهمة التالية (pending → active) |
| `markDone(id, result)` | إغلاق المهمة مع تسجيل النتيجة |
| `getQueueStats()` | إحصائيات القائمة |
| `seedDefaultQueue()` | تعبئة المهام الافتراضية عند الإقلاع |
| `missionLoop()` | توليد مهام جديدة عندما تنخفض القائمة |
| `runHeartbeat()` | تنفيذ مهمة واحدة ثم إعادة التعبئة |

### Endpoints في البوت
- `GET /tasks/next` → المهمة التالية + إحصائيات.
- `POST /tasks/done` → تحديث حالة مهمة (`taskId, result`).
- `GET /tasks` → إحصائيات القائمة.

### التصنيفات المدعومة في التنفيذ
`email` → فحص البريد (watchdog)، `opportunities` → مراجعة الفرص (job-applicant)، `marketing` → منشور تسويقي، `sales` → متابعة الطلبات المعلقة، `maintenance` → فحص سلامة DB، `store` → فحص المتجر.

## ✅ الحالة: ناجح — والقائمة تعمل تلقائياً عبر `/heartbeat` كل 5 دقائق.
