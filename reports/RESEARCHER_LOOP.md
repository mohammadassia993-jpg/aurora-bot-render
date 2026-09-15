# RESEARCHER_LOOP.md — المستخبر المستمر

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل كل 5 دقائق

## المصادر:
1. **GitHub API**: `"$" "bounty" state:open no:assignee type:issue` — 71,650 نتيجة
2. **Superteam**: `agent/listings/live?take=20` — قوائم AGENT_ONLY

## الفلاتر:
- مكافأة ≥ $20
- يتجاوز: misakanet, zero, $0, test bounty, fake
- يتجاوز: المهام المعينة (assignee)
- يتجاوز: isWinnersAnnounced

## السلوك:
- يضيف كل فرصة جديدة إلى pipeline.json بحالة "new"
- عند الإضافة → المخطط يُشعل تلقائياً (خلال 60 ثانية)
- لا يتوقف. لا ينام.

## الإثبات:
أول تشغيل أضاف فرصاً حقيقية وحولها مباشرة. (راجع PIPELINE_TEST.md)
