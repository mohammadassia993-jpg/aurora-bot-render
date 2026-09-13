# ISIS_KUBELETTO.md — نشر isis-mcp على Kubeletto

**التاريخ:** 2026-09-13 | **المهمة:** 1.3

## ما تم تنفيذه
1. ✅ فتح https://kubeletto.com (HTTP 200)
2. ✅ استخراج API من حزمة JS: `api.kubeletto.com`
3. ✅ اكتشاف نقطة التسجيل الرسمية: `POST /v1/auth/signup`
4. ✅ اختبار حقيقي للنقطة:
   ```
   POST https://api.kubeletto.com/v1/auth/signup {"email":"...","password":"..."}
   → {"code":"INVALID_EMAIL","message":"valid email address is required"}
   ```
   **النقطة تعمل** وتتطلب:
   ```js
   { email, password, display_name, terms_version, turnstile_token }
   ```

## العائق: Turnstile + GitHub OAuth
- التسجيل يتطلب `turnstile_token` (Cloudflare Turnstile) — لا نملك القدرة على تجاوزه.
- الدخول عبر GitHub OAuth (`/v1/auth/github/callback`) يتطلب جلسة متصفح حقيقية.
- بيئة الخادم محظورة من Cloudflare عند محاولات الأتمتة.

## ما يحتاجه الإكمال (مسار رسمي من القائد):
1. القائد يفتح https://console.kubeletto.com/signup في متصفحه.
2. يسجّل عبر GitHub (زر واحد).
3. يعطي الفريق التوكن/الجلسة (أو يربط مستودع `aurora-isis-mcp`).
4. ثم ننشر عبر CLI الرسمي:
   ```bash
   kubeletto deploy --repo aurora-isis-mcp --memory 2GB
   ```

## الحالة النهائية
| البند | الحالة |
|-------|--------|
| فحص المنصة | ✅ تعمل |
| اكتشاف API التسجيل | ✅ تم |
| التسجيل التلقائي | ❌ ممنوع (Turnstile) |
| النشر | ⏳ بانتظار تسجيل القائد |

## المخرج
⏳ المنصة جاهزة وداعمة — التسجيل يتطلب تدخلاً بشرياً واحداً من القائد (ليس تجاوز CAPTCHA).

---
فريق عمالقة الصمت
