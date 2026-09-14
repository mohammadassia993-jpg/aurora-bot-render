# GENSEE_CRATE_DEPLOY.md — نشر Gensee Crate

**التاريخ:** 2026-09-14
**الحالة:** ❌ غير متاح (لا يوجد API للاشتراك الذاتي)

## النتائج:
- **URL:** https://crate.gensee.ai
- **HTTP Status:** 302 (يُحوّل إلى crate-enterprise.html)
- **النتيجة:** Gensee Crate هو تطبيق ويب مؤسسي (Enterprise) يتطلب:
  1. تسجيل دخول عبر المتصفح (لا يوجد API مفتوح)
  2. لا يوفر API عامة للاشتراك الذاتي
  3.Requires interactive browser session for account creation

## الأدلة:
```bash
curl -sI https://crate.gensee.ai
# HTTP/2 302
# location: /crate-enterprise.html
```

## السبب في الفشل:
Gensee Crate هو منصة مؤسسية مصممة للشركات الكبيرة. لا يوجد أي نقطة نهاية API عامة للاشتراك الذاتي أو إنشاء حساب. يتطلب تفاعل متصفح بشري.

## البديل:
- Render (يعمل حالياً مع Self-Ping)
- HuggingClaw (يتطلب HF token)
