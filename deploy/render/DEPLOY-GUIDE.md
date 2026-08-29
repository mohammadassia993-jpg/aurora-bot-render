# دليل نشر Render — النسخة النهائية (أول سبتمبر 2026)

هذا دليل جاهز للتنفيذ في أول سبتمبر. كل الملفات والمتغيرات والتجهيزات موجودة في المستودع.

## الوضع الحالي (قبل النشر)
- المستودع: `mohammadassia993-jpg/aurora-bot-render` (branch `main`)
- الملف الجاهز للنشر التلقائي: `render.yaml` (Blueprint)
- الدخول: سكربت `deploy/render/start.sh` الذي يسحب قاعدة البيانات ثم يشغّل المنصة
- فاحص التكافؤ: `node scripts/check-render-parity.js <URL> data/render-parity-report.json`

## الطريقة الموصى بها: Blueprint (render.yaml)

1. سجّل الدخول إلى https://dashboard.render.com
2. انقر **New** → **Blueprint**
3. اربط GitHub: `mohammadassia993-jpg/aurora-bot-render`
4. اختر `render.yaml` — سيقرأ Render الخدمة `aurora-silent-giants` تلقائياً
5. عند الطلب، عبّئ المتغيرات السرية المحمية (غير مكتوبة في الملف):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `TEAM_UI_TOKEN`
   - `DATABASE_SYNC_TOKEN`
   - `SILICONFLOW_API_KEY` (من https://siliconflow.cn)
   - `GEMINI_API_KEY` / `OPENROUTER_API_KEY` (اختياري)
6. انقر **Apply** → انتظر البناء

## أو: إنشاء Web Service يدوياً

- **Name:** `silent-giants-primary`
- **Region:** Oregon (أو الأقرب)
- **Branch:** `main`
- **Runtime:** Node
- **Build Command:** `npm ci --omit=dev || npm install --omit=dev`
- **Start Command:** `bash deploy/render/start.sh`
- **Health Check Path:** `/health`

### متغيرات البيئة
```
PORT=8787
PLATFORM_ROLE=render
ALLOW_DATABASE_RESTORE_RESTART=true
MAIL_DELIVERY_MODE=queue
AI_SIMULATION_MODE=false
SILICONFLOW_MODEL=deepseek-chat
TELEGRAM_BOT_TOKEN=<من .env>
TELEGRAM_WEBHOOK_SECRET=<من .env>
TEAM_UI_TOKEN=<من .env>
DATABASE_SYNC_TOKEN=<نفس .env>
SILICONFLOW_API_KEY=<من القائد>
TELEGRAM_FAILOVER=false
OFFICIAL_EMAIL=auroraalmada4@gmail.com
BACKUP_EMAIL=Mohammadassia993@gmail.com
```

## بعد النشر — التحقق

### 1. نقاط النهاية
```bash
curl https://silent-giants-primary.onrender.com/health
# → {"ok":true,"health":{gateway,internet,telegram,ai,memory,disk}}
curl https://silent-giants-primary.onrender.com/api/dashboard
curl https://silent-giants-primary.onrender.com/report
```

### 2. إعداد Webhook Telegram (بدل polling)
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://silent-giants-primary.onrender.com/telegram/webhook&secret_token=<SECRET>"
```

### 3. تفعيل وكيل الذكاء عبر SiliconFlow
- بعد وضع `SILICONFLOW_API_KEY`، يتحول النموذج تلقائياً إلى `deepseek-chat` (أو Qwen/GLM).
- تحقق: أرسل رسالة في تيليجرام → يجب أن يكون الرد عربياً وذكياً.

### 4. فحص التكافؤ (نفس البيانات بين المصدرين)
```bash
node scripts/check-render-parity.js https://silent-giants-primary.onrender.com data/render-parity-report.json
```
- الهدف: تطابق `/health` و`/api/dashboard` و`/report` بين المحلي وRender.

### 5. الاختبار الوظيفي للتفويض
```bash
/delegate aurora "تحقق من حالة المتجر"
/delegation      → حالة الوكلاء
/approve 1 yes   → موافقة على طلب معلق
/products /orders → المتجر
```

## Keep-Alive (منع وضع السكون — خطة Render المجانية)
على **cron-job.org** (مجاني):
1. أنشئ حساباً على https://cron-job.org
2. أنشئ مهمة:
   - **URL:** `https://silent-giants-primary.onrender.com/health`
   - **Interval:** كل 14 دقيقة (الحد الأدنى المجاني للـ sleep هو 15)
3. احفظ — سيبقى الخادم مستيقظاً.

## الخطة الاحتياطية (إن فشل Render)
- **GitHub Codespaces:** شغّل `npm start` في Codespace (لكن لا يعمل 24/7)
- **Koyeb / Fly.io:** بدائل VPS مجانية مشروطة
- **النظام المحلي (الخيار الحالي):** يعمل الآن، وضع الاستمرارية مفعّل.

## ملاحظة المفاتيح
- SiliconFlow: سيسجّل القائد ويكمل المفتاح خلال النشر.
- Dework/Titan: يبقيان محاكاة حتى توفر مفاتيحهما.
- لا تسليم نهائي لأي عقد دون موافقة بشرية.
