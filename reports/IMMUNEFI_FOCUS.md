# IMMUNEFI_FOCUS.md — التركيز على Immunefi
**التاريخ:** 2026-09-15
**الحالة:** ✅ 3 برامج محددة

## البرامج المحددة
| # | البرنامج | Max Bounty | السبب |
|---|---------|-----------|-------|
| 1 | RootstockLabs | $200,000 | الأحدث (سبتمبر 2026), أقل تدقيقاً |
| 2 | NUVA | $40,000 |老字号 DeFi |
| 3 | Ern | $50,000 |老字号 DeFi |

## البرامج المحددة للتحليل العميق
**الأولى:** RootstockLabs ($200k)

### تحليل RootstockLabs
- المستودع: xyphx0/RootstockLabs (in-scope contracts)
- البروتوكول: Flyover (PegIn/PegOut bridge بين Bitcoin و RSK)
- 45 ملف hợp đồng

**الثغرة المكتشفة:**
1. **Medium:** `slashPegInCollateral` لا يتحقق من صحة الـ quote
   - COLLATERAL_SLASHER يمكنه تحديد penaltyFee تعسفي
   - لا يوجد تحقق من أن quoteHash يتوافق مع quote
   - الأثر: خصم تعسفي من LPs

2. **Low:** `withdrawCollateral` لا يتحقق من وجود orders نشطة
   - LP بعد الاستقالة يمكنه سحب كل الكفالة حتى مع orders معلقة

### tools used
- Manual analysis (deep reading of all functions)
- MIESC (quick scan)
- OpenAudit (reference)
