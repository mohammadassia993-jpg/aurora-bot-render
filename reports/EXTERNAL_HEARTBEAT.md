# EXTERNAL_HEARTBEAT — نظام النبض الخارجي

**التاريخ:** 2026-09-13 | **الدفعة:** (#)

## المشكلة الجذرية:
الفريق يتوقف بعد كل أمر لأن لا أحد يستدعي Heartbeat من الخارج على Render.

## الحل: GitHub Actions المجدول (خارجي + مجاني + بدون بطاقة)

### حددت：
- cron-job.org: REST API أُوقف (صفحات 404 على cron-job.org/en/api.html والتسجيل 308→404).
- UptimeRobot: يحتاج حساب + بطاقة ائتمان ((methodology NotImplemented في الواجهة).
- **GitHub Actions**: المستودع `mohammadassia993-jpg/aurora-bot-render` **عام** (public) → دقائق مجانية غير محدودة. لا حاجة لحساب جديد أو بطاقة.

### عملاء GitHub Actions:
1. **`.github/workflows/heartbeat.yml`**: ينفّذ كل 5 دقائق `GET /heartbeat` على Render.
2. **`.github/workflows/report.yml`**: ينفّذ كل 3 ساعات `GET /send-report` على Render.

### التحقق:
- تم اختبار `/heartbeat` يدوياً: `ok: true, executed: 99, queue: pending=4, done=96`.
- `/tasks` يُظهر `types` (دليل تشغيل الكود الجديد).
- `workflow_dispatch` متاح لتفعيل يدوي.
