# LIGHTPANDA_ARM64.md — Lightpanda Binary ARM64

**التاريخ:** 2026-09-14
**الحالة:** ❌ Cannot download (GitHub timeout from this network)

## النتائج:
- **lightpanda-io/browser releases:** ✅ موجود على GitHub
- **الإصدارات المتاحة:** v0.4.0, v0.3.7, v0.3.6
- **-binary المطلوب:** lightpanda-aarch64-linux
- **الحالة:** ❌ curl timeout (60s) عند محاولة التحميل من GitHub

## المحاولات:
```bash
# محاولة 1: nightly release
curl -L -o /tmp/lightpanda "https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-aarch64-linux"
# curl: (28) Connection timed out after 60002 milliseconds

# محاولة 2: v0.4.0 stable
curl -L -o /tmp/lightpanda "https://github.com/lightpanda-io/browser/releases/download/0.4.0/lightpanda-aarch64-linux"
# curl: (28) Connection timed out after 59810 milliseconds
```

## السبب:
GitHub downloads تتجاوز من هذه البيئة السحابية. هذا مشكلة شبكة وليس مشكلة في Lightpanda.

## الحل:
- تشغيل Lightpanda على جهاز آخر (Termux على الهاتف)
- أو تحميل عبر mirror/CDN
- أو استخدام Docker (إن كان متاحاً)
