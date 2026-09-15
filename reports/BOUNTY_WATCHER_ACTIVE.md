# BOUNTY_WATCHER_ACTIVE.md — مراقب الجوائز الفوري

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل كل 5 دقائق ويرسل عبر Telegram

## السكربت:
- **scripts/watch_bounties.sh** — يبحث في GitHub + Superteam
- **scripts/followup_15min.sh** — يتابع الردود كل 15 دقيقة
- **src/scheduler.js** — يشغّل watcher كل 5 دقائق + follow-up كل 15 دقيقة

## أول تشغيل (نتائج فعلية):
- 20+ رسالة Telegram أُرسلت إلى chatId=888229115
- فرص حقيقية تم اكتشافها (message IDs 1430-1452)
- $500 USDC + iBox: Mission 04 — Onchain Ontology (intuition-box/Ontology#9)

## طبقات البحث:
1. `"$" "bounty" state:open no:assignee type:issue` — 71,650 نتيجة
2. `"bounty" "$" language:python state:open` — مهام برمجية
3. `bounty in:title state:open no:assignee` — عناوين bounty

## الفلترة (منع الوهمي):
- يتجاوز: misakanet, zero, $0, test bounty, fake
- يتجاوز المهام المعينة (assignee != null)
- يحفظ المُراجع في /tmp/bounty_seen/ لمنع التكرار
