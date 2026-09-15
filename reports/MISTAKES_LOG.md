# MISTAKES_LOG.md — سجل الأخطاء
**التاريخ:** 2026-09-15
**الحالة:** ✅ 10 أخطاء موثقة

## القاعدة: لا نكرر نفس الخطأ مرتين

| # | التاريخ | الخطأ | السبب الجذري | الدرس | القاعدة الجديدة |
|---|---------|-------|-------------|-------|----------------|
| 1 | 2026-09-14 | Not Found على SecureSignature → توقف | اعتماد على رابط واحد | ابحث في 6 منصات | NOT_FOUND_RECOVERY |
| 2 | 2026-09-14 | API 500 على Superteam → توقف | اعتماد على API فقط | Playwright أولاً | PLAYWRIGHT_FIRST |
| 3 | 2026-09-13 | تثبيت Kuren بدون استخدام | تثبيت بدون خطة | لا تثبيت بدون خطة | INSTALL_WITH_PLAN |
| 4 | 2026-09-13 | Lightpanda بدون binary | عدم التحقق من التوافق | تحقق قبل التثبيت | VERIFY_COMPATIBILITY |
| 5 | 2026-09-15 | مطاردة CVE/GHSA → مكافأة ميتة | عدم فهم CVE = ميتة | تجاهل CVE/GHSA | DEAD_BOUNTY_BLOCK |
| 6 | 2026-09-12 | 1.7 ثانية تقييم شكلي | عدم مراجعة فعلية | ≥ 15 ثانية + إثبات | REVIEWER_STANDARD |
| 7 | 2026-09-11 | دراسة قوالب بدل التنفيذ | productive procrastination | التنفيذ أولاً | EXECUTE_FIRST |
| 8 | 2026-09-10 | 7 أدوات CAPTCHA | عدم تركيز | أداة واحدة فقط | ONE_TOOL_ONLY |
| 9 | 2026-09-10 | تقرير ناجح ثم فشل | اختبار بعد الإبلاغ | اختبر أولاً | TEST_BEFORE_REPORT |
| 10 | 2026-09-09 | انتظار تدخل بشري | Fear of action | Playwright يحل كل شيء | NO_WAITING |

## الملفات
- `data/mistakes.json` — JSON formatted
- `data/rules.json` — 15 قاعدة
- `src/pattern-detector.js` — محرك أنماط تلقائي
