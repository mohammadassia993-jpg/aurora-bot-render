# OPPORTUNITY_VALIDATOR — نظام التحقق من الفرص (2.1 + 2.3)

**التاريخ:** 2026-09-13 | **الملف:** `src/opportunity-validator.js`

## ما يفعله:
1. **فحص الاحتيال**: `SCAM_KEYWORDS` (airdrop claim / send tokens / seed phrase / honeypot / rug pull / backdoor / proxy contract) — أي تطابق يُرفض فوراً.
2. **فحص المنصات الوهمية**: `FAKE_PLATFORM_RE` — platforms like "unknown-platform.fake-bounty".
3. **الحد الأدنى للمكافأة**: `$50` — أي مكافأة أقل تُرفض.
4. **حد التوافق**: `fit_score < 40` يُرفض.
5. **رابط غير صالح**: URL يفشل في `new URL()` أو protocol غير http/https.
6. **دفع مسبق**: `upfrontCost > 0` أو `requiresFunds = true` → يُرفض.
7. **فحص Honeypot**: `honeypotScan(text)` يفحص كلمات احتيالية في وصف العقد.

## الاختبارات الناجحة (محلياً):
- فرصة حقيقية: `passed: true, score: 87` ✅
- فرصة احتيال (airdrop claim): `passed: false` ✅
- دفع مسبق: `passed: false` ✅
- Honeypot detects: `true` ✅
