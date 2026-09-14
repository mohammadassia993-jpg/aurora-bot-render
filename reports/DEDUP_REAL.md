# DEDUP_REAL.md — منع تكرار الفرص

**التاريخ:** 2026-09-14 | **المهمة:** 1.3

## الفحص على قاعدة البيانات الفعلية
- الجدول: `tasks` (هو جدول الفرص في هذه المنظومة).
- `external_id` عليه **UNIQUE constraint** (مؤكد عبر PRAGMA).
- **عدد المكررات الحالي: 0** — الحذف الوقائي نفّذ ولم يحذف شيئاً (`purged=0`).

## الضمانات
1. `PRAGMA index_list(tasks)` → يوجد index فريد (sqlite_autoindex_tasks_1).
2. كل مصادر الفرص تولّد `external_id` فريد:
   - `remoteok:{id}` / `remotive:{id}` / `ht-...`
3. الـ upserts تستخدم `ON CONFLICT(external_id) DO UPDATE` — لا إدراج مكرر.

## الاختبارات
`test/dedup-separation.test.js` — 5 اختبارات:
- وجود UNIQUE index ✅
- لا مكررات حالياً ✅
- إدراج duplicate external_id مرفوض (خطأ) ✅
- الفصل بوت/قناة ✅ (3 فحوصات)

## المخرج
✅ لا فرصة مكررة — فريد globally وسلوك رفض عند الإدراج المكرر.

---
فريق عمالقة الصمت
