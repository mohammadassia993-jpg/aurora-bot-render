# RULES_DATABASE.md — قاعدة القواعد (15 قاعدة)
**التاريخ:** 2026-09-15
**الحالة:** ✅ 15 قاعدة معلنة

## القواعد حسب الأولوية

### CRITICAL (4 قواعد)
1. **DEAD_BOUNTY_BLOCK** — أي CVE/GHSA → مرفوض تلقائياً
2. **TEST_BEFORE_REPORT** — اختبر قبل الإبلاغ
3. **NO_WAITING** — لا انتظار تدخل بشري
4. **PROOF_REQUIRED** — كل خطوة تحتاج إثبات

### HIGH (5 قواعد)
5. **NOT_FOUND_RECOVERY** — ابحث في 6 منصات
6. **PLAYWRIGHT_FIRST** — Playwright قبل API
7. **REVIEWER_STANDARD** — ≥ 15 ثانية + توثيق
8. **EXECUTE_FIRST** — التنفيذ أولاً
9. **AUTO_RETRY** — حوّل تلقائياً عند الفشل
10. **EVERY_TASK_OUTPUT** — كل مهمة تُنتج مخرجاً

### MEDIUM (4 قواعد)
11. **INSTALL_WITH_PLAN** — لا تثبيت بدون خطة
12. **ONE_TOOL_ONLY** — أداة واحدة متقنة
13. **MIN_BOUNTY_200** — لا مكافآت < $200
14. **VERIFY_COMPATIBILITY** — تحقق قبل التثبيت

## الملفات
- `data/rules.json` — JSON formatted
- `src/pattern-detector.js` — محرك تطبيق تلقائي
