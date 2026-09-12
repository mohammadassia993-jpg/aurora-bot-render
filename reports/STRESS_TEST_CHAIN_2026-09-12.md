# STRESS_TEST — السلسلة الجديدة 2026-09-12 16:20 UTC

## KeylessAI (المطلوب كأساسي)
- **النتيجة: ❌ فشل** — `keylessai.thryx.workers.dev` لا يحل DNS (NXDOMAIN).
- جُمّعت الاختلافات `keyless-ai/` و`keylessai.workers.dev` و`keyless.thryx.workers.dev` — كلها NXDOMAIN.

## UncloseAI (احتياطي ثالث مطلوب)
- **النتيجة: ❌ فشل** — الموقع واجهة chat ويب فقط (مشروع permacomputer).
- `/v1/models` و`/v1/chat/completions` و`/api/v1/chat/completions` و`/openapi.json` → 404 (HTML SPA لجميع المسارات).

## LongCat Lite (50M توكن/يوم)
- **النتيجة: ❌ غير قابل** — منصة LongCat تابعة لمجموعة Meituan الصينية.
- التسجيل عبر H5guard (anti-bot) ورقم هاتف صيني (Meituan). لا يوجد تسجيل بالبريد الإلكتروني فقط.
- `/v1/chat/completions` يخدم HTML فقط — لا وثائق API عامة.

## اختبار التحمل النهائي (السلسلة السارية: llm7 → pollinations → agnes)
| السيناريو | أول مزوّد ناجح | الزمن الكلي |
|---|---|---|
| لا شيء متوقف | LLM7 | ~3.5s (طلب عربي) |
| LLM7 متوقف | Agnes (بعد محاولة Pollinations 402/DG-AI 502) | ~27s مع إعادة المحاولة |
| LLM7 + Pollinations متوقفان | فشل مؤقت (DG-AI 502 + Agnes 429 لحظياً) | ~14s |

## ملاحظات
- LLM7: 20 طلباً → 10/20 OK (متوسط 666ms) ثم 429 (نافذة حد ~10 طلبات).
- Pollinations: يعمل بـ curl (200) لكن 402 تحت الضغط (حصة منخفضة للمجهول) — يحتاج تباعد.
- Agnes: 200 متقطع (محتوى فارغ أحياناً، 429 أحياناً).
- DG-AI: يجري اختباره غداً (13/9) بعد تجدد الحصة.

مُعد: الفريق — 2026-09-12
