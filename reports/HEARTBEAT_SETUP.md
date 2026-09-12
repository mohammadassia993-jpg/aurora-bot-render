# HEARTBEAT_SETUP.md — تفعيل Heartbeat خارجي + داخلي
التاريخ: 2026-09-12 23:20 UTC

---

## ✅ المنفَّذ في `src/server.js` + `src/index.js`

### نقطة `/heartbeat`
- ينفذ `runHeartbeat()`: يسحب المهمة التالية، ينفذها حسب تصنيفها، يغلقها، ثم يعيد تعبئة القائمة عبر Mission Loop.
- الاستجابة: `{ ok, executed, description, result, queue, refill }`.

### نقطة `/send-report`
- ينفذ `sendScheduledReport()`: يجمع أرقاماً فعلية (رسائل بريد، منشورات قناة، منتجات منشورة، طلبات/مدفوعة، إحصائيات القائمة).
- يرسل التقرير إلى أورورا عبر `sendMessageDetailed` ويسجله في `operations_marketing`.

### نبض داخلي (بدون الحاجة لـ cron-job.org)
- `setInterval(runHeartbeat, 5 * 60 * 1000)` في `src/index.js`.
- إضافة cron احتياطي `*/5 * * * *` في `src/scheduler.js`.

### إعداد اختياري خارجي (cron-job.org — مجاني)
- مهمة كل 5 دقائق → `https://aurora-bot-render.onrender.com/heartbeat`
- مهمة كل 3 ساعات → `https://aurora-bot-render.onrender.com/send-report`
- لا يحتاج أي توكن — البوت ينفذ داخلياً.

## ✅ الحالة: ناجح — ويعمل ذاتياً حتى بدون cron-job.org.
