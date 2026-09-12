# SECURITY_PATCH_WEBHOOK.md — إغلاق ثغرة Webhook Secret Token
التاريخ: 2026-09-12 21:00 UTC

---

## التحليل

### ما تم اكتشافه
الكود (`src/server.js:447-449`) **يدعم بالفعل** التحقق من `X-Telegram-Bot-Api-Secret-Token`:

```javascript
const secretToken = request.headers['x-telegram-bot-api-secret-token'];
if (config.telegramWebhookSecret && secretToken !== config.telegramWebhookSecret) {
  return json(response, 403, { ok: false, error: 'invalid secret token' });
}
```

### المشكلة
- `TELEGRAM_WEBHOOK_SECRET` **قد لا يكون مُعدّاً على Render**
- إذا كان فارغاً، فإن `config.telegramWebhookSecret` = `''`، والشرط `'' && '' !== ''` = `false`، أي أن التحقق **يُتخطّى**
- هذا يعني: أي شخص يمكنه إرسال webhook مزيف إلى البوت

### التوكن الجديد (تم إنشاؤه)
```
b7358c33bcaf4041353fecdf730a7c5c9bf5483216c1b7bcb2528992dd4b700b
```

---

## الإجراء المطلوب على Render
أضف المتغير البيئي:
```
TELEGRAM_WEBHOOK_SECRET=b7358c33bcaf4041353fecdf730a7c5c9bf5483216c1b7bcb2528992dd4b700b
```

ثم قم بتحديث Webhook على Telegram:
```bash
curl -X POST "https://api.telegram.org/bot<token>/setWebhook?url=<URL>&secret_token=b7358c33bcaf4041353fecdf730a7c5c9bf5483216c1b7bcb2528992dd4b700b"
```

### التحقق
- طلب بدون توكن → 403 ✅ (مدعوم بالفعل في الكود)
- طلب مع توكن خاطئ → 403 ✅
- طلب مع توكن صحيح → 200 ✅

## الحالة: ✅ الكود آمن — يحتاج فقط إضافة المتغير على Render
