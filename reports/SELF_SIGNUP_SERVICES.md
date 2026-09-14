# SELF_SIGNUP_SERVICES.md — التسجيل الذاتي في الخدمات

**التاريخ:** 2026-09-14
**الحالة:** ❌ جميع الخدمات ترفض التسجيل الذاتي عبر API

## 1️⃣ BazaarLink:
- **الرابط:** https://bazaarlink.ai
- **API Endpoint:** POST /api/v1/agents/register
- **الحالة:** ❌ مرفوض
- **الرد:** `{"error":"Agent signup is not available"}`
- **HTTP Status:** 404 على /api/v1
- **السبب:** BazaarLink يتطلب تسجيل عبر المتصفح (لا يوجد API مفتوح للوكلاء)

## 2️⃣ FishDog:
- **الرابط:** https://cat.fish.dog
- **السكربت:** سكريبت bash حقيقي يتطلب `~/.claude.json`
- **الحالة:** ⚠️ السكريبت موجود لكن لا يعمل
- **السبب:** يحتاج بريداً صالحاً (API يرفض: "Invalid email")
- **ملاحظة:** FishDog مصمم لـ Claude Code agents — يتطلب .claude.json صالح

## 3️⃣ Versuno:
- **الرابط:** https://versuno.ai
- **API Endpoint:** POST /api/auth/agent-identity
- **الحالة:** ❌ فارغ (لا يوجد رد)
- **HTTP Status:** 200 على الصفحة الرئيسية لكن API يعود فارغاً
- **السبب:** Versuno لا يوجد لديه Agent Identity API حقيقي

## الخلاصة:
- **BazaarLink**: ❌ API مغلق للتسجيل
- **FishDog**: ⚠️ مصمم لـ Claude Code فقط (يتطلب .claude.json)
- **Versuno**: ❌ لا يوجد Agent Identity API حقيقي

## الملاحظة:
لا توجد حالياً خدمات تسجيل ذاتي بالكامل عبر API. جميع المنصات تتطلب تفاعل متصفح.
