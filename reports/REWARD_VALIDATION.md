# REWARD_VALIDATION.md — فلتر المكافأة الصارم (N/A والحالات كلها)

**التاريخ:** 2026-09-14 | **المهمة:** 1.2

## الدالة الجديدة `hasValidReward(r)` في `src/opportunity-validation.js`

| القيمة | الحكم |
|--------|-------|
| `0` (رقم) | ❌ مرفوض |
| `"0"` (نص) | ❌ مرفوض |
| `"N/A"` / `"n/a"` | ❌ مرفوض |
| `null` / `undefined` | ❌ مرفوض |
| `""` (فارغ) | ❌ مرفوض |
| `"unknown"` / `"Free"` (بلا رقم) | ❌ مرفوض |
| `250` / `"$500"` / `"1,000 USDT"` | ✅ مقبول |

```js
export function hasValidReward(r) {
  if (r === null || r === undefined) return false;
  const s = String(r).trim();
  if (s === '' || s.toLowerCase() === 'n/a' || s === '0') return false;
  if (!/\d/.test(s)) return false;
  const num = Number(s.replace(/[^0-9.\-]/g, ''));
  return !Number.isNaN(num) && num > MIN_REWARD;
}
```

## التكامل
- `validateOpportunity()` تستخدم `hasValidReward` الآن (وليس `Number(opp.reward)`).
- تُستخدم في: `operations.js` (فرص + جوائز)، `automator.js` (Superteam)، `task-queue.js` (dossier).

## الاختبارات
`test/n-a-reward.test.js` — 6 اختبارات ناجحة (كل حالات الرفض + القبول).

## المخرج
✅ فلتر يعالج جميع الحالات: N/A، 0، نص بلا رقم، null، فارغ.

---
فريق عمالقة الصمت
