# SEND_PATHS_AUDIT.md — تتبع كل مسارات إرسال الفرص

**التاريخ:** 2026-09-14 | **المهمة:** 1.1

## مسارات الإرسال المكتشفة (grep شامل)

| الملف | الدالة | ماذا ترسل | حالة الفلتر قبل الإصلاح |
|-------|--------|-----------|--------------------------|
| `src/operations.js` | `runOpportunityDiscovery()` | ملخص الفرص الجديدة (ظ§5) | ✅ مفلتر سابقاً |
| `src/operations.js` | `getPrizesReport()` | **تقرير الجوائز: "الإجمالي: N فرصة" + قائمة** | ❌ **كان يتسرب (لا فلتر)** |
| `src/operations.js` | `startPrizesReport()` | استدعاء التقرير اليومي | ❌ يتسرب عبر getPrizesReport |
| `src/automator.js` | `monitorSuperteam()` | **"🎯 فرصة جديدة على Superteam! (N فرصة مفتوحة)"** | ❌ **كان يتسرب (كل القوائم)** |
| `src/research.js` | `runDailyResearch()/runWeeklyResearch()` | notify داخلي فقط (لا يرسل Telegram) | ✅ |
| `src/telegram.js` | `dailyReport()` | عدّادات فقط (لا قائمة فرص) | ✅ |
| `src/job-applicant.js` | `submitApplication()/reviewOld` | إشعارات تقديم (وليست قائمة) | ⚠️ لا ترسل فرص $0 |

## المسار المتسرب (السبب الجذري)
**`getPrizesReport()`**: كان يقرأ كل المهام التي تطابق كلمات (bounty/prize/grant/جائزة) من `tasks` بلا أي فلتر ويحسب `prizes.length` ويرسل "الإجمالي: N فرصة" — وهذا هو مصدر رسالة "53 فرصة".

**`automator.js` (Superteam)**: كان يرسل كل القوائم المفتوحة المطابقة بلا تحقق من المكافأة.

## الإصلاح
- `getPrizesReport()` → الآن `async` + `filterValidOpportunities()` قبل العدّ والرسل.
- `automator.js` → `hasValidReward(l.rewardAmount)` قبل الإرسال.

## المخرج
✅ قائمة كاملة بالمسارات + إصلاح المسارين المتسربين.

---
فريق عمالقة الصمت
