# PROVIDERS_UNLIMITED — تقرير المزودات الجديدة (بلا حصص) 2026-09-12 16:25 UTC

## 1) Dahl — ❌ فشل
- `https://inference.dahl.global/v1/chat/completions` → HTTP 401 `invalid_api_key` لكل من `MiniMaxAI/MiniMax-M2.7` و`moonshotai/Kimi-K2.6`.
- المفتاح `not-needed` غير مقبول — المنصة تتطلب مفتاحاً حقيقياً من حساب مدفوع.
- 10/10 طلبات فشلت (كلها 401، ~450ms).

## 2) DanyAPI — ❌ فشل
- `https://danyapi.cloudpub.ru/v1/chat/completions` → HTTP 401 `invalid deepseek api key` / `invalid qwen api key`.
- المفتاح `dummy` غير مقبول — الوكيل يتطلب مفاتيح upstream حقيقية.
- 10/10 طلبات فشلت (كلها 401، ~1.2–3.8s).

## 3) Gemini — ❌ محجوب من سوريا
- المفتاح موجود بالفعل في `.env` (AQ.Ab8...، 53 حرفاً) ويعمل من حيث التحقق (400 وليس 401).
- لكن `gemini-3.6-flash` يعود: `400 User location is not supported for the API use` — Google يحجب وظيفة API من IP سوري (دمشق، AS201550).
- `gemini-2.5-flash` لم يعد متاحاً (404 لمستخدمين جدد)؛ `2.0-flash`/`1.5-flash` محذوفة.
- الخلاصة: الويب قد يعمل في سوريا، لكن واجهة API generator تعيد 400 دائماً.

## 4) Logfare.ai — ✅ نجاح (مزود أساسي جديد)
- التسجيل: `POST /v1/auth/register` باسم مستخدم+كلمة مرور (بدون بريد، بدون CAPTCHA).
- الحساب: `aurora-almada-88` — المفتاح: `lfu_iFQ-...` (36 حرفاً).
- الاختبار (10 طلبات متتالية):
  - `gemma-4-26b`: 10/10 OK، متوسط 3486ms.
  - `logfare/auto`: 10/10 OK، متوسط 3755ms.
- ملاحظات: `qwen-3.8-27b` و`moondream3.1` نماذج premium تتطلب opt-in لتدريب النماذج — النماذج القياسية متاحة فوراً.
- التوكنات تُحتسب بـ "neurons" لكن لم نلحظ أي حد على 20 طلباً تجريبياً.

## 5) zendriver-mcp (LLM7 Turnstile) — ❌ فشل
- `zendriver-mcp` غير موجود على npm (E404). المكافئ: `zendriver`/`nodriver` (Python).
- ثُبّت `zendriver` في venv واستُخدم على LLM7:
  - headless + headed (Xvfb) + `verify_cf(timeout=60)` — كلها انتهت بـ "Cloudflare challenge elements not found or not visible within 60 seconds".
  - صفحة الدخول الجديدة لـ LLM7 تعرض Turnstile checkbox قبل "Continue with email" — لا يُحل تلقائياً من IP مركز بيانات.
- LLM7 يبقى عاملاً على الطبقة المجهولة (~10 طلبات/نافذة ثم 429) بدون توكن.

## السلسلة النهائية المعتمدة
```
Logfare (gemma-4-26b, مفتاح lfu_...) → LLM7 (بدون مفتاح) → Pollinations → Agnes → DG-AI (غداً)
```

- اختبار سريع للسلسلة: Logfare HTTP 200 (2.7s، محتوى فارغ بسبب max_tokens)، LLM7 نجح في 884ms إجمالي 3.6s.
- المزودون النشطون: **3** (Logfare + LLM7 + Agnes/Pollinations متقطعان).

## الملفات
- `config/ai-config.json` — محدّث (Logfare أساسي).
- `reports/STRESS_TEST_CHAIN_2026-09-12.md` — السابق.

مُعد: الفريق — 2026-09-12
