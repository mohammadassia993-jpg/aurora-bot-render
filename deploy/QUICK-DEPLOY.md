# 🚀 دليل النشر السريع - Silent Giants

## الخيار 1: Koyeb (مجاني، بدون بطاقة ائتمان)

### الخطوات:
1. افتح https://app.koyeb.com
2. سجّل الدخول بحساب GitHub الخاص بك
3. اضغط "Create Service" → اختر "GitHub"
4. اختر المستودع: `mohammadassia993-jpg/aurora-bot-render`
5. اختر Branch: `main`
6. Builder: Docker
7. Port: `8787`
8. Health check: `/health`
9. أضف متغيرات البيئة التالية:

```
PORT=8787
TELEGRAM_BOT_TOKEN=8964456145:AAEcQ5AGdssnNbgMRW06b96PMiaXXvsWVdE
TELEGRAM_WEBHOOK_SECRET=b5rRBpEPisZmxMvw8gAtk-Wl21mgFEXkZkeNUj3lY8c
TEAM_UI_TOKEN=8cdQ7WY9SvAGxe6SfFPlngj0_UbX6vCr
AI_SIMULATION_MODE=true
TELEGRAM_FAILOVER=false
MAIL_DELIVERY_MODE=queue
OFFICIAL_EMAIL=auroraalmada4@gmail.com
BACKUP_EMAIL=Mohammadassia993@gmail.com
```

10. اضغط "Deploy"
11. انتظر حتى يصبح الحالة "Healthy"
12. الرابط سيكون: `https://silent-giants.koyeb.app`

### بعد النشر:
```bash
# ربط Telegram بالـ Webhook
curl "https://api.telegram.org/bot8964456145:AAEcQ5AGdssnNbgMRW06b96PMiaXXvsWVdE/setWebhook?url=https://silent-giants.koyeb.app/telegram/webhook&secret_token=b5rRBpEPisZmxMvw8gAtk-Wl21mgFEXkZkeNUj3lY8c&allowed_updates=%5B%22message%22%5D"
```

---

## الخيار 2: HuggingFace Spaces (مجاني، بدون بطاقة)

### الخطوات:
1. افتح https://huggingface.co
2. سجّل الدخول أو أنشئ حساباً
3. اضغط "New Space"
4. اختر: Docker → Blank
5. اختر: Free CPU tier
6. اسم المساحة: `silent-giants`
7. ارفع الملفات التالية:
   - `Dockerfile` (من المشروع)
   - `package.json`
   - `src/` (كاملة)
   - `public/`
   - `SOUL.md`
8. أضف متغيرات البيئة في Settings
9. انتظر حتى يعمل

---

## الخيار 3: Render (مدفوع)

- يحتاج بطاقة ائتمان
- جميع الخدمات المجانية معلّقة
- إذا أضفت بطاقة → يمكن تفعيل خدمة جديدة

---

## ملاحظات مهمة:
- بعد أي نشر → أرسل `/status` للبوت للتحقق
- البوت يعمل الآن على المنفذ 8788 محلياً
- الكود محمّل على GitHub: `mohammadassia993-jpg/aurora-bot-render`
