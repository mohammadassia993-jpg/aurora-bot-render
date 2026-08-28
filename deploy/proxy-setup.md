# توثيق محاولة الوسيط المحلي (anymodel / openrouter-proxy) — 2026-08-28

## النتيجة: ❌ لا يحل المشكلة

### الأداة المختارة: `anymodel` (v1.17.0)
- الاختيار: أسهل خيار، يعمل عبر `npm`، بدون اعتماديات، مناسب لـ Termux/Android.
- Docker غير متاح في البيئة → استُبعد `openrouter-proxy`.

### التثبيت والتشغيل
```bash
npm install -g anymodel
OPENROUTER_API_KEY="sk-or-..." anymodel proxy openai --model "meta-llama/llama-3.3-70b-instruct:free" --port 8080 --host 127.0.0.1
```

### الاختبار الفعلي (ناتج حقيقي من الخادم)
عند إرسال طلب عبر الوسيط على `http://127.0.0.1:8080/v1/messages`:

```
403: {"error":{"code":"unsupported_country_region_territory",
"message":"Country, region, or territory not supported","type":"request_forbidden"}}
```

### التحليل الجذري
- الوسيط المحلي **يعمل تقنياً** (يستمع على port 8080).
- لكنه يرسل الطلب النهائي إلى OpenRouter من **نفس IP الخادم السوري**.
- OpenRouter (و backends مقدّمي النماذج المجانية مثل OpenAI) يرفض **المنطقة الجغرافية** بالكامل.
- النتيجة: **أي وسيط محلي لا يستطيع تجاوز الحظر الجغرافي** — لأن نقطة الخروج النهائية تبقى IP سوري.

### الخلاصة
الحظر ليس بالتوكن ولا بالوسيط؛ بل **بحظر جغرافي على مستوى IP الخادم**. الحل الوحيد:
1. خادم خارجي في منطقة مدعومة (Cloudflare Worker / Render مدفوع / VPS أجنبي)، **أو**
2. مفتاح Gemini صحيح (AIza...) مع VPN من جهة القائد، **أو**
3. مزود لا يحظر سوريا (يجب اختبار كل مزود على حدة).

---
*توثيق محاولة حقيقية بعدم إخفاء النتائج — عمالقة الصمت*
