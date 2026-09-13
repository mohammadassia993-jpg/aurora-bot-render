# HERMES_HF_DEPLOY.md — نشر Hermes على Hugging Face Spaces

**التاريخ:** 2026-09-13  
**المهمة:** 1.2 — نشر Hermes Agent على HF Spaces

---

## المحاولة

### خطوات النشر المخططة:
1. تسجيل حساب على HuggingFace
2. إنشاء Space جديد (SDK: Docker، CPU basic 2 vCPU 16GB RAM)
3. رفع Dockerfile الخاص بـ Hermes
4. إضافة متغيرات البيئة (LLM providers)
5. اختبار الاستجابة

### العقبة المكتشفة:
```
STATUS: 202 | URL: https://huggingface.co/join
TITLE: Human Verification
BODY: "Let's confirm you are human — Complete the security check before continuing."
```

- HuggingFace يستخدم **AWS WAF CAPTCHA** على صفحة التسجيل
- **لا Cloudflare Turnstile** — EzSolver لا ينفع هنا
- AWS WAF لا يمكن تخطيه آلياً من بيئة headless

## النتيجة: ❌ معلق — يتطلب تدخلاً بشرياً

### المطلوب من القائد (التدخل البشري الوحيد):
1. أنشئ حساباً على huggingface.co يدوياً
2. أنشئ Token من Settings → Access Tokens → New token (scope: write)
3. أرسل التوكن للمنصة

### بعد الحصول على التوكن:
```bash
# إنشاء Space عبر API
curl -X POST https://huggingface.co/api/spaces \
  -H "Authorization: Bearer hf_TOKEN" \
  -d '{"sdk":"docker","name":"aurora-hermes","hardware":"cpu-basic"}'

# رفع Dockerfile
cd /tmp/hermes-deploy
git push https://hf.co/aurora-hermes
```

## الحالة النهائية

| البند | الحالة |
|-------|--------|
| Dockerfile جاهز | ✅ موجود في المستودع |
| متطلبات HF Spaces | ✅ موثقة |
| CAPTCHA | ❌ يمنع التسجيل الآلي |
| مسالك الحل | ⏳ بانتظار حساب HF من القائد |

## البديل: Render (hero-free)
- الحساب عليه خدمتان مجانيتان
- Hermes يتطلب خطة Standard (مدفوعة)
- ⏳ معلق على إضافة بطاقة ائتمان للحساب

## المخرج
❌ CAPTCHA يمنع النشر الآلي — بانتظار تدخل بشري واحد فقط.

---
فريق عمالقة الصمت
