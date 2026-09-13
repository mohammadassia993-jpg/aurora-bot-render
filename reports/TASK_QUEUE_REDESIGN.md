# TASK_QUEUE_REDESIGN — إعادة هيكلة قائمة المهام

**التاريخ:** 2026-09-13

## التغييرات (تم تنفيذها في الدفعة السابقة):
- أعمدة `type, recurring_interval, last_run_at, next_run_at, archived`.
- ترتيب السحب: `on-demand → one-time → recurring`.
- `archiveDoneTasks(3)` — أرشفة بعد 3 أيام.
- `hasPending(category)` — منع تكرار المهام.
- تنفيذ `apply-opportunity` و`opportunities` مع التحقق.

## الحالة الحية:
- `task_queue`: pending=4, done=96, total=100 (بعد heartbeat).
- لا مهام قديمة ولا مكررة.
