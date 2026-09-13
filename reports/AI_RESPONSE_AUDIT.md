# AI_RESPONSE_AUDIT.md — فحص وإصلاح استخدام AI في الردود
التاريخ: 2026-09-13 05:55 UTC

---

## 🔍 السبب الجذري (لماذا كانت الردود قوالب؟)
1. **Render لم يكن يملك أي مفاتيح AI** — المتغيرات كانت 12 فقط بدون AGNES/LLM7/Logfare.
2. `config/ai-config.json` (الذي يوثق LLM7/Logfare/Agnes) **غير مستخدم في الكود إطلاقاً** — الـ runtime يقرأ `process.env` فقط.
3. بدون مفاتيح → `availableModels()` يختار `local-deterministic` أو `kimi-k3` بمفتاح AIHubMix افتراضي (رصيد صفر) → فشل → `smartFallback()` (القالب).
4. `research.js` كان يولّد فرصاً «من خيال AI» (external_id بادئته `research:`) بدون تحقق — مصدر الفرص الوهمية.

## ✅ الإصلاح (commit 17492f4 + أحدث)
- أضيف مزودا `logfare` و`llm7` كاملاً (config + availableModels + selectModel + callModel).
- **الأولوية الجديدة**: Logfare ← LLM7 ← Agnes (كما أمر القائد)، و`AI_PRIMARY_MODEL=logfare` على Render.
- **سلسلة تراجع حقيقية داخل callModel**: فشل الأساسي → جرّب LLM7 → ثم Agnes → ثم القالب فقط لو فشل الكل.
- **تسجيل تدقيق**: `callModel: agent=... model=... latency=...ms chars=... error=...` في كل استدعاء.

## ✅ التحقق اليدوي للمزودين (من هذه البيئة)
- Logfare: HTTP 200 ✅
- LLM7: HTTP 200 ✅ (رد حقيقي)
- Agnes: مهلة ❌ (متقطع — تراجع طبيعي لـ LLM7/Logfare)

## ✅ الحالة: AI حقيقي يعمل — القالب يستخدم فقط عند فشل الثلاثة جميعاً.
