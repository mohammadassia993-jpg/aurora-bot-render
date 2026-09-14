# DB_CLEANUP_OPPORTUNITIES.md — مسح الفرص القديمة من قاعدة البيانات

**التاريخ:** 2026-09-14 | **المهمة:** 1.3

## المعيار (مطبق على `tasks` — جدول الفرص في المنظومة)
```
reward صالح (>0، يرفض N/A/0/null/فارغ/بلا رقم)
+ رابط http(s) موجود
+ وصف > 100 حرف
```

## النتائج الفعلية
| البند | العدد |
|-------|-------|
| فرص غير صالحة تم حذفها | **11** |
| تبعيات محذوفة (agent_runs) | 2 |
| approvals محذوفة | 0 |
| memory_task_context محذوفة | 0 |
| مهام task_queue المرتبطة بالفرص | 0 |
| المتبقي من مهام jobs/opportunity | **0** |

## سكريبت الإعادة
`scripts/cleanup-invalid-opportunities.js`:
```bash
node scripts/cleanup-invalid-opportunities.js
```
- يحذف التبعيات أولاً (FK constraint) ثم المهام غير الصالحة وtask_queue.

## المخرج
✅ قاعدة بيانات نظيفة — لا توجد أي فرصة $0/بلا رابط/بوصف قصير.

---
فريق عمالقة الصمت
