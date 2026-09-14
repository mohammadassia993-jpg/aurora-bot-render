# CUA_SANDBOX.md — Cua Computer SDK (القلعة السحابية)

**التاريخ:** 2026-09-14
**الحالة:** ⚠️ مثبت — يحتاج CUA_API_KEY للتشغيل

## النتائج:
- **التثبيت:** ✅ ناجح
  - `cua-computer` v0.5.19
  - `cua-core` v0.3.1
  - `cua-agent[all]` (مثبت)
- **Computer class:** ✅ يعمل
  - `provider_type='cloud'` مدعوم
  - Supports: run, start, stop, interface, pip_install, python_command, playwright_exec
  - `interface` methods: screenshot, left_click, type_text (يحتاج run() أولاً)

## blockers:
```
api_key required for CloudProvider
(provide via parameter or CUA_API_KEY environment variable)
```

## ما نجح:
- التثبيت: ✅
- إنشاء Computer كائن: ✅
- تحديد provider_type='cloud': ✅

## ما يحتاج API key:
- `computer.run()` → يحتاج CUA_API_KEY
- `computer.interface.screenshot()` → يحتاج run() أولاً
- التحكم بالجهاز السحابي → يحتاج run() أولاً

## للاكمال:
1. سجل في https://cua.computer
2. احصل على CUA_API_KEY
3. اضبط: `export CUA_API_KEY=sk_cua-api01_...`
4. شغّل: `await computer.run()`
