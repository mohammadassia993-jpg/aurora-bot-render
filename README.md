# Silent Giants Platform

نظام محلي خفيف لإدارة المهام والوكلاء الأربعة مع مراقبة ذاتية وتعلم أساسي من الأداء.

## التشغيل

```bash
bash install.sh
```

اللوحة: `http://127.0.0.1:8787`  
الفحص: `http://127.0.0.1:8787/health`  
التقرير: `http://127.0.0.1:8787/report`

## الإعداد الاختياري

عدّل `$HOME/silent-giants/.env` ثم أعد تشغيل الأمر أعلاه:

- `TELEGRAM_BOT_TOKEN` و`TELEGRAM_ADMIN_CHAT_ID` للتنبيهات والأوامر.
- `OPENROUTER_API_KEY` أو `GEMINI_API_KEY` للتوليد الكامل.
- `TITAN_API_URL` لمراقبة العقد.
- `JOB_FEED_URL` لمسار الوظائف.
- `OPPORTUNITY_FEED_URL` بدل الفرص التجريبية المحلية.
- `DEWORK_API_TOKEN` فقط بعد الحصول على تكامل معتمد.

## الأمان

- لا تضع `PRIVATE_KEY` أو `SEED_PHRASE` في `.env`.
- النظام يستخدم عناوين استلام فقط ولا ينفذ سحباً.
- كل تسليم أو عقد يمر عبر موافقة بشرية افتراضياً.
- ملف `.env` صلاحياته `600`.

## النسخة الاحتياطية

```bash
npm run package
```

الملف الناتج: `dist/silent-giants-platform.tar.gz`.

## الطوارئ

```bash
curl -X POST http://127.0.0.1:8787/emergency \
  -H 'content-type: application/json' \
  -d '{"message":"Primary phone service failed"}'
```

يسجل أورورا الحدث، يرسل تنبيه Telegram إذا كان مفعلاً، ويحاول إرسال بريد إلى `auroraalmada4@gmail.com`.
إذا لم تكن بيانات SMTP مضبوطة، يبقى البريد في سجل التدقيق كطابور طوارئ آمن.

## إعادة المحاولة

المسار الافتراضي: `5000,15000,60000` milliseconds.  
يمكن تغييره عبر `RETRY_DELAYS_MS` في `.env`.

## النسخة الاحتياطية

```bash
export HF_TOKEN=...
export HF_USERNAME=...
bash deploy/huggingface/deploy.sh
```

يتم إنشاء Space بنفس الكود والهوية والقواعد الأمنية على المنفذ `7860`.
