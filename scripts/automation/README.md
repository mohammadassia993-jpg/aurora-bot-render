# 🤖 نظام التقديم الآلي — Superteam Earn

## الحالة الحالية
- ✅ Puppeteer مثبت
- ✅ Chrome مثبت (x86_64)
- ⚠️ المعمارية: ARM64 (البيئة الحالية) — Chrome لا يعمل
- ✅ Python + Playwright مثبت

## الحل: تقديم يدوي مؤقت + أتمتة مستقبلية

###খালেল1. التقديم اليدوي (الآن)
- افتح الرابط من `deliverables/superteam-submissions/`
- اضغط "Apply"
- أضف الملفات
- أرسل

### 2. الأتمتة المستقبلية (بعد نقل النظام لخادم x86_64)
- Puppeteer سيعمل بشكل طبيعي
- يمكن تشغيل `submit-superteam.cjs` تلقائياً
- جدولة عبر cron

## الملفات
- `submit-superteam.cjs` — سكربت Puppeteer
- `prepare-content.cjs` — تجهيز المحتوى
- `cookies.json` — ملفات الجلسة (يتم حفظها تلقائياً)
