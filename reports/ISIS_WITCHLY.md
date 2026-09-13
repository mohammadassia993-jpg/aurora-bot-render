# ISIS_WITCHLY — نشر isis-mcp على Witchly

**التاريخ:** 2026-09-13

## المحاولة
- Witchly: https://dash.witchly.host (سيرفرات Node.js مجانية)

## النتيجة: ❌ يتطلب Discord OAuth

**السبب التقني القاطع:**
witchly.host يتطلب تسجيل الدخول عبر Discord OAuth.
لا يوجد token Discord في البيئة. لا يمكن التسجيل آلياً.

## المطلوب من القائد
1. أنشئ حساباً على Discord أو استخدم حساباً موجوداً
2. سجّل الدخول على Witchly عبر Discord
3. أنشئ سيرفر Node.js وارفع isis-mcp يدوياً

## المخرَج
❌ Discord OAuth يمنع التسجيل الآلي.
