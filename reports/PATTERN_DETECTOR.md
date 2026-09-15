# PATTERN_DETECTOR.md — محرك الأنماط
**التاريخ:** 2026-09-15
**الحالة:** ✅ محرك جاهز

## الملف: `src/pattern-detector.js`

### الوظائف
- `detectPattern(context)` — يقارن الموقف مع الأخطاء السابقة
- `getRule(ruleName)` — يعيد قاعدة محددة
- `getAllRules()` — يعيد جميع القواعد
- `shouldBlock(opportunity)` — يتحقق إذا كانت الفرصة يجب حجبها

### أمثلة الاستخدام
- "Not Found on page" → يستدعي NOT_FOUND_RECOVERY
- "API returned 500" → يستدعي PLAYWRIGHT_FIRST
- "CVE-2026-1234" → يستدعي DEAD_BOUNTY_BLOCK

### أنماط مكتشفة (10 أنماط)
1. Not Found / 404 → 6 بدائل
2. API error → Playwright
3. CVE/GHSA → تجاهل
4. Install → خطة استخدام
5. Fast review → مراجعة فعلية
6. CAPTCHA → أداة واحدة
7. Template → تنفيذ
8. Report → اختبار أولاً
9. Wait → Playwright
10. Error → auto-retry
