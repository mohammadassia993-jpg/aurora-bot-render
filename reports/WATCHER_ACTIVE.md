# WATCHER_ACTIVE.md — مراقب الجوائز
**التاريخ:** 2026-09-15
**الحالة:** ✅ مُفعّل

## المراقب
- watch_bounties.sh — كل 5 دقائق
- يبحث عن: GitHub bounties ≥ $200, Superteam listings, Immunefi programs
- يُرسل إشعار فوري عبر Telegram

## الملفات
- scripts/watch_bounties.sh ✅
- scripts/watch_github.sh ✅
- scripts/watch_superteam.sh ✅
