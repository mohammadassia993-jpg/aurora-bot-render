# CUA_LOCAL.md — Cua Computer SDK (وضع محلي)

**التاريخ:** 2026-09-14
**الحالة:** ❌ local provider غير مدعوم

## النتائج:
- **cua-computer:** v0.5.19 مثبت ✅
- **provider_type='local':** ❌ Unsupported provider type

## الخطأ:
```
ValueError: Unsupported provider type: unknown
RuntimeError: Failed to initialize VM provider
```

## السبب:
Cua لا يدعم `provider_type='local'`. المدعوم:
- `provider_type='cloud'` ← يحتاج CUA_API_KEY
- `provider_type='lume'` ← الافتراضي (macOS فقط)

## البديل:
- استخدم Playwright MCP المثبت مسبقاً للتحكم بالمتصفح
- `@agent360/browser-mcp` v1.29.1 يعمل على port 8080
