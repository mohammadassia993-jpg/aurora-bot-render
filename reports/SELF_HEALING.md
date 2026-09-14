# SELF_HEALING.md — حلقة التعافي الذاتي

**التاريخ:** 2026-09-14 | **المهمة:** 2.1

## الوحدة الجديدة: `src/self-healing.js`

### تصنيف الأخطاء
| النوع | الأمثلة | السلوك |
|-------|---------|--------|
| **transient** | timeout, ECONNRESET, 502/503/504 | إعادة المحاولة 3 مرات بفواصل 5s→15s→60s |
| **permanent** | 404/401/403, Not Found, Unauthorized | تسجيل + انتقال للمهمة البديلة (fallback) |
| **environmental** | CAPTCHA, WAF, Turnstile, Human Verification | تسجيل + انتقال للمهمة البديلة — **بدون تجاوز غير مصرح به** |

### تسجيل الفشل
- كل فشل يُكتب إلى: `logs/failures.log` (JSON lines).
- مع النوع، عدد المحاولات، والرسالة.

### API
```js
import runWithHealing from './self-healing.js';
const result = await runWithHealing(async () => {
  // المهمة
}, { scope: 'deploy-hermes', onFallback: (err, kind) => {...} });
// result: { ok, kind, attempts, result|error }
```

### الاختبارات
`test/self-healing.test.js` — 5 اختبارات ناجحة (5/5):
- تصنيف transient (network/502/timeout) ✅
- تصنيف permanent (404/401) ✅
- تصنيف environmental (WAF/Turnstile) ✅
- إعادة محاولة بعد فشل عابر ثم نجاح ✅
- فشل دائم → استدعاء fallback ✅

## المخرج
✅ الفريق لا يتوقف عند أي فشل: عابر → يعيد، دائم/بيئي → ينتقل للبديل.

---
فريق عمالقة الصمت
