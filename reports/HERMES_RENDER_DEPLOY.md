# HERMES_RENDER_DEPLOY — نشر Hermes Agent على Render

**التاريخ:** 2026-09-13 | **المهمة:** 1.1

## ما تم فحصه
- المستودع: `render-examples/hermes-render` — موجود ✅
- Blueprint `render.yaml`: مُ getCountsown ✅
- متطلبات: `plan: standard` (مدفوع) + disk 5GB + Docker

## الحالة الحالية: ⏳ معلق — يتطلب بطاقة ائتمان

### السبب التقني القاطع
Render API يرفض إنشاء أي خدمة جديدة بدون معلومات الدفع:
> "Payment information is required to complete this request."

الحساب الحالي (mohammad's workspace) عليه خدمتان مجانيتان (aurora-bot-render + silent-giants-render-backup) — كلاهما أُنشئتا قبل تقييد الدفع.

### المطلوب من القائد (التدخل البشري الوحيد)
1. افتح: https://dashboard.render.com/billing
2. أضف بطاقة ائتمان (حتى مع خطة مجانية — Render يطلبها للتحقق).
3. بعد ذلك: أنشئ خدمة Hermes عبر Blueprint:
   - اضغط "New+" → "Blueprint" → اختر مستودع `render-examples/hermes-render`
   - اختر خطة Standard
   - أضف المتغيرات: `AI_PRIMARY_MODEL=agnes` + `AI_KEY=...` + `TELEGRAM_BOT_TOKEN=...`

### أو البرمجيات (بعد إضافة الدفع)
سأستخدم Render API لإنشاء الخدمة تلقائياً:
```bash
POST /v1/services {
  "type": "web_service",
  "name": "hermes",
  "plan": "standard",
  "repo": "https://github.com/render-examples/hermes-render"
}
```

## المخرَج
⏳ معلق على إضافة بطاقة ائتمان للحساب Render فقط.
