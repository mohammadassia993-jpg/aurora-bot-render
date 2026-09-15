# HONEYPOT_FILTER.md — فلتر Honeypot التلقائي

**التاريخ:** 2026-09-15
**الحالة:** ✅ يعمل في opportunity-validator.js + pipeline.js

## الإشارات المكتشفة:
1. **متطلبات غريبة**: IPv4→IPv6 على smart contracts، solc --tcp-handshake، gas metering مرتبط بـ IP
2. **مكافأة ضخمة لمشروع جديد**: > $1,000 لمشروع عمره < 7 أيام
3. **تعليقات قليلة مع مكافأة عالية**: ≤ 3 تعليقات مع ≥ $500
4. **Repo غير معروف**: < 5 نجوم، أو Fork فقط

## التنفيذ:
```javascript
// src/opportunity-validator.js
detectHoneypot({ title, body, url, comments, reward, repoCreatedDays, stars, isFork })
// → { isHoneypot, signals, confidence }
```

## التكامل:
- المستخبر يفحص كل فرصة قبل إضافتها
- عند اكتشاف honeypot → recordHoneypot() + تجاهل الفرصة
- العدّاد + وقت آخر اكتشاف قابلان للاستعلام

## أول اكتشاف موثق:
- **bounty-plaza/1214** "Migrate Ethereum IPv4→IPv6" ($350) — فخ مؤكد (متطلبات ملفقة)
- سُحبت الدعوة + كشف الفخ علناً (comment #5674872427)

## التقرير الأسبوعي:
honeypotCount() → { detected, lastDetectedAt }
