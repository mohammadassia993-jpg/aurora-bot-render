# متطلبات تكافؤ Render
Render الحالي حي، لكنه واجهة OpenClaw Control وليست نسخة Silent Giants المطابقة. حزمة الترقية جاهزة في الجذر عبر `render.yaml` و`deploy/render/start.sh`.

## ما تم تنفيذه محليًا
- عند كل إقلاع تسحب النسخة الاحتياطية قاعدة البيانات مباشرة من نفق الهاتف عبر `/api/sync/database` وتتحقق من SHA-256.
## ما تم تنفيذه محليًا
- نفس كود الخدمة ونفس نقاط `/health` و`/report` و`/api/dashboard`.
- أمر بدء يستقبل قاعدة البيانات ثم يشغّل المنصة: `deploy/render/start.sh`.
- مسار استقبال آمن للمزامنة: `POST /api/sync/database` بمفتاح `DATABASE_SYNC_TOKEN` وتحقق SHA-256.
- مزامنة تلقائية من الأساسي إلى Render بعد كل نسخة احتياطية كل ٦ ساعات.
- فاحص تكافؤ فعلي: `node scripts/check-render-parity.js <RENDER_URL> data/render-parity-report.json`.

## عائق النشر الحالي
النشر الفعلي يحتاج أحد أمرين:
1. مفتاح Render API صالح لتحديث خدمة `aurora-bot-render`؛ أو
2. مستودع GitHub متصل بـ Render وصلاحية دفع الكود المحدّث إليه.

بعد توفر أحدهما يجب تعيين هذه القيم في Render:
- `PLATFORM_ROLE=render`
- `ALLOW_DATABASE_RESTORE_RESTART=true`
- `DATABASE_SYNC_TOKEN=` نفس القيمة الموجودة في `.env` الأساسي دون تغييرها.
- مفاتيح Telegram وواجهة الفريق كما في الأساسي.

## نقاط النهاية المطلوبة
- `/health`: JSON صحي يفحص Gateway وInternet وTelegram وAI وMemory وDisk.
- `/report`: تقرير موحد بالحالة الفعلية وطوابير البريد.
- `/api/dashboard`: نفس بيانات الفريق والمشاريع والأداء.
- Telegram Polling أو Webhook آمن مع إعادة تشغيل تلقائية.

## قواعد التشغيل
- البريد يبقى طابورًا حتى إضافة App Password.
- Dework وTitan يبقيان محاكاة حتى توفر مفاتيحهما.
- لا تسليم نهائي لأي عقد دون موافقة بشرية.
- بعد النشر يجب مقارنة `/api/dashboard` و`/health` بين المصدرين قبل ترقية Render إلى احتياطي مطابق.

## نتيجة الفحص الأخير
`data/render-parity-report.json` يثبت أن Render الحالي غير مطابق: `/report` يعيد HTML، و`/api/dashboard` يعيد 404، وفحص الصحة ينقصه مكونات النظام الستة.
