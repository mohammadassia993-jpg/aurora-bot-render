# FILTER_AT_CREATION.md — الفلتر عند الإنشاء

**التاريخ:** 2026-09-14 | **المرحلة:** 3

## القاعدة الجديدة
> لا شيء يُنشَأ إلا إذا كان صالحاً — الفلتر يُطبَّق **قبل الإدراج في قاعدة البيانات**.

## الدالة `shouldCreateOpportunity(opp)` في `src/opportunity-validation.js`
```js
function shouldCreateOpportunity(opp) {
  if (!hasValidReward(opp.reward)) return false;          // 0/N-A/null/free
  const link = String(opp.link || opp.url || '').trim();
  if (!link.startsWith('http')) return false;              // رابط مفقود/غير http
  const desc = String(opp.description || opp.why || opp.details || '').trim();
  if (desc.length < 100) return false;                     // وصف قصير
  return true;
}
```

## نقاط الدمج (كل مسارات الإنشاء)
| الملف | الدالة | السلوك |
|-------|--------|--------|
| `opportunity-scan.js` | `upsertReal()` | لا تُدرج فرصة غير صالحة إطلاقاً |
| `initiator.js` | `createTask()` | `return null` قبل إنشاء المهمة إن فشل الفلتر |
| `connectors.js` | `upsertTask()` | مرفوض للفرص/الوظائف غير الصالحة |
| `task-queue.js` | إنشاء مهام الفرص | نفس المسار عبر الفلتر |

## الاختبارات
`test/filter-at-creation.test.js` — 6 اختبارات ناجحة:
- $0 / "0" / N/A / Free مرفوض
- رابط مفقود/غير http مرفوض
- وصف قصير مرفوض
- فرصة صالحة مقبولة
- null/undefined مرفوض

## المخرج
✅ قاعدة بيانات نظيفة لا تُملأ إلا بالفرص الصالحة — لا فرص $0 مستقبلاً.

---
فريق عمالقة الصمت
