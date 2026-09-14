# BROWSERBASH.md — BrowserBash CLI

**التاريخ:** 2026-09-14
**الحالة:** ✅ مثبت ويعمل (يتطلب LLM API key)

## النتائج:
- **الحزمة:** browserbash-cli (npm global)
- **التثبيت:** ناجح ✅
- **الأوامر:**
  - `run <objective>` — تنفيذ أمر بلغة طبيعية في متصفح حقيقي
  - `testmd` — تشغيل ملفات *_test.md
  - `run-all` — تشغيل مجلد اختبارات بالتوازي
  - `monitor` — مراقبة دورية
  - `dashboard` — لوحة تحكم محلية
  - `login` — حفظ بيانات الاعتماد

## الاختبار:
```bash
browserbash run "Open example.com and take a screenshot" --headless --timeout 30
# Error: No LLM backend available.
# Either: install Ollama, or set ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY
```

## الخيارات المتاحة:
- `--headless` — تشغيل بدون متصفح مرئي
- `--provider` — local | cdp | browserbase | lambdatest | browserstack
- `--engine` — stagehand (default) | builtin
- `--agent` — إصدار أحداث NDJSON للـ agents
- `--cdp-endpoint` — نقطة اتصال CDP
- `--model` — نموذج LLM

## المطلوب للعمل:
- ANTHROPIC_API_KEY أو OPENAI_API_KEY أو OPENROUTER_API_KEY
- أو: ollama pull qwen3

## الخلاصة:
BrowserBash CLI مثبت ويعمل. يحتاج فقط LLM API key للتحكم بالمتصفح ب lệnh طبيعية.
