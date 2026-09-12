# RENDER_OPTIMIZATION.md — تحسينات استهلاك Render
التاريخ: 2026-09-12 22:55 UTC

---

## التحسينات المطبقة (كود)

### 1. تعليق توليد حزمة 92-مهام (Scheduler 05:00)
**قبل**: يُنفَّذ يومياً بغض النظر (ثقيل — استدعاءات AI كثيرة)
**بعد**: يُنفَّذ فقط إذا `CONTINUOUS_PRODUCTION_ENABLED=true`
```javascript
if (process.env.CONTINUOUS_PRODUCTION_ENABLED !== 'true') { return; }
```
**الأثر**: توفير كبير في RAM/CPU/API عند كل 05:00

### 2. تقليل فحص المنافسات/العقود من كل 2س إلى كل 6س
```javascript
cron.schedule('0 */6 * * *', ...)  // بدلاً من */2
```
**الأثر**: 4 استدعاءات/يوم بدلاً من 12 → توفير ~66% شبكة

### 3. تقليل Health check من كل 15د إلى كل 30د
**الأثر**: تخفيف الحمل غير الضروري (الفحص مجرد كتابة DB)

### 4. صيانة SQLite أسبوعية (VACUUM + integrity)
- `PRAGMA wal_checkpoint(TRUNCATE)` — تفريغ WAL
- `VACUUM` — ضغط قاعدة البيانات
- `PRAGMA integrity_check` — كشف تلف
- **الأثر**: منع نمو DB غير المحدود

### 5. تفعيل `PRAGMA auto_vacuum = INCREMENTAL`
**الأثر**: تقليص تلقائي للصفحات المحذوفة

---

## التحسينات المقترحة (خارج الكود)

### 6. نقل المهام الثقيلة إلى cron-job.org (مجاني)
بدلاً من تشغيل فحوصات ثقيلة داخل Render، يمكن تعيين cron خارجي:
- ينشئ cron-job.org مهمة ping لـ `https://aurora-bot-render.onrender.com/api/trigger/heavy-task` كل 6 ساعات
- **التسجيل في cron-job.org يتطلب بريداً** — يمكن لاحقاً (يوفر عمر Render)

### 7. تقليل Self-ping
- الحالي: كل 10 دقائق (Render ينام بعد 15 دقيقة خمول)
- كافي — لا تغيير مطلوب (خفضه أكثر قد يسبب نوم Render)

### 8. مراقبة manual عبر Render dashboard
- راجع Memory Usage في Render → Metrics
- إذا تجاوز 70%، فعّل التحسينات الفورية أعلاه

---

## المقارنة قبل/بعد

| المقياس | قبل | بعد |
|---------|-----|-----|
| عمليات cron يومية | ~14 | ~7 (-50%) |
| توليد 92-مهام | يومي ثقيل | معطل (flag) |
| Health checks/يوم | 96 | 48 |
| فحص العقود/يوم | 12 | 4 |
| DB | تنمو بدون ضبط | VACUUM أسبوعي |
