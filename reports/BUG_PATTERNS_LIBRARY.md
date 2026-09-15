# BUG_PATTERNS_LIBRARY.md — مكتبة أنماط الثغرات المعروفة
**التاريخ:** 2026-09-15
**الحالة:** ✅ 10 أنماط موثقة

## الأنماط العشرة

| # | النمط | SWC | الوصف | طريقة الكشف | العلاج |
|---|-------|-----|-------|-------------|--------|
| 1 | Reentrancy | SWC-107 | إعادة دخول قبل تحديث الحالة | external calls قبل state | Checks-Effects-Interactions |
| 2 | Access Control | SWC-105 | غياب التحكم في الوصول | وظائف بدون modifier | onlyOwner / RBAC |
| 3 | Integer Overflow | SWC-101 | تجاوز حدود الأرقام | uint بدون SafeMath | Solidity 0.8+ |
| 4 | Oracle Manipulation | SWC-114 | التلاعب بالأسعار | oracles غير محمية | TWAP |
| 5 | Flash Loan | SWC-114 | قرض فوري للهجوم | اعتماد على السيولة | TWAP / محددات |
| 6 | Front-running | SWC-114 | سباق المعاملات | تسلسل قابل للسبق | Commit-Reveal |
| 7 | Signature Replay | SWC-121 | إعادة استخدام توقيع | توقيعات بدون nonce | nonce + chainId |
| 8 | Delegate Call | SWC-112 | delegatecall تالف | استدعاء غير موثوق | توثيق الهدف |
| 9 | Unchecked Return | SWC-104 | تجاهل قيمة العودة | call بدون تحقق | safeTransfer |
| 10 | Timestamp Dependence | SWC-116 | الاعتماد على block.timestamp | timestamp في شروط | فترات واسعة |

## الملف: `data/bug_patterns.json`
- ✅ JSON formatted
- ✅ 10 أنماط معروفة
- ✅ برامج مكافآت لكل نمط

## الاستخدام مع pattern-detector.js
عند تحليل عقد جديد:
1. قارن الكود مع الأنماط
2. إذا وجدت تطابقاً → حدد الخطورة
3. اكتب PoC
4. قدّم على برنامج المكافآت
