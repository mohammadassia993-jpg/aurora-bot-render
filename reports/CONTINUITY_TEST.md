# CONTINUITY_TEST.md — اختبار الاستمرارية
التاريخ: 2026-09-12 23:20 UTC

---

## ✅ ما تم التحقق منه في هذه البيئة
- `node --check` ناجح على `task-queue.js`, `server.js`, `index.js`, `scheduler.js`, `db.js`.
- الجدول `task_queue` يُنشأ تلقائياً عند أول استيراد.
- إصلاحان مطبقان:
  - `outbox` أُضيف إلى schema في `src/db.js` (كان مستخدماً دون تعريف — يسبب فشل استعلامات التقرير).
  - مسار `opportunities` أصبح يستدعي `reApplyOldOpportunities()` بدلاً من دالة غير موجودة.

## ⚠️ القيد الصادق
- **لا يمكن مراقبة سجلات Render الحية من هذه البيئة** (لا يوجد توكن Render API).
- التحقق الميداني النهائي يحتاج:
  1. التأكد من وصول تقرير أورورا كل 3 ساعات في Telegram.
  2. (اختياري) `curl http://127.0.0.1:8787/heartbeat` عند تشغيل البوت محلياً.
  3. فحص `logs/platform.log` من Render Shell بحثاً عن `heartbeat ok: task=... queue=...`.

## 🔁 إذا توقف الفريق
1. افحص سجلات Render لرسائل `heartbeat`/`task-queue`.
2. تأكد أن متغيرات البيئة (`TELEGRAM_CHANNEL_ID`, `TELEGRAM_ALLOWED_IDS`, token) موجودة.
3. أعد النشر (Manual Deploy → Deploy latest commit) — القائمة في SQLite تبقى.

## ✅ الخلاصة: البنية الآن ذاتية الدفع — المهام تُنفَّذ عبر نبض داخلي كل 5 دقائق دون أوامر جديدة.
