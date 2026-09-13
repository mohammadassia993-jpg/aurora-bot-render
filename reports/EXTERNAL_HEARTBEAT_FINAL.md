# EXTERNAL_HEARTBEAT_FINAL — النبض الخارجي الحقيقي

**التاريخ:** 2026-09-13 | **المهمة:** 2.2 — Heartbeat لا ينقطع

## الوضع الحالي
| المصدر | الحالة |
|---|---|
| cron-job.org API | ❌ متوقف (404 — خدمة خارجية) |
| UptimeRobot | ❌ يتطلب إنشاء حساب بشري جديد (التسجيل يحتاج تفعيل بريد — مُقيّد) |
| GitHub Actions | ⏳ بانتظار PAT بصلاحية workflow |
| **الإبقاء المتبادل (Peer Keepalive)** | ✅ **يعمل الآن** — الخدمتان تضربان بعضهما كل 5 دقائق |

## التنفيذ
- `aurora-bot-render` → `PEER_KEEPALIVE_URL=https://silent-giants-render-backup.onrender.com/health`
- `silent-giants-render-backup` → `PEER_KEEPALIVE_URL=https://aurora-bot-render.onrender.com/health`
- كل خدمة تنعش الأخرى عبر `/health` كل 5 دقائق.

## بدائل مستقبلية
- عند توفر PAT بصلاحية workflow: دفع ملفات `/root/keepalive-local/github-workflows/workflows/*.yml` (جاهزة محلياً) ليعمل النبض من GitHub كل 5 دقائق + تقرير كل 3 ساعات.

## المخرَج
✅ Heartbeat يعمل حاليًا دون انقطاع عبر الإبقاء المتبادل؛ يُستكمل بـ GitHub Actions فور توفر الصلاحية.
