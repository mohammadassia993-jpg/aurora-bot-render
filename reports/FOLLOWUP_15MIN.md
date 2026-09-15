# FOLLOWUP_15MIN.md — آلية المتابعة الفورية

**التاريخ:** 2026-09-15
**الحالة:** ✅ تعمل كل 15 دقيقة

## السكربت:
- **scripts/followup_15min.sh** — يفحص الردود على تعليقاتنا في GitHub

## ما يفعله:
1. يفحص Issues الثلاثة المطلوبة:
   - BasedHardware/omi#13884
   - bounty-plaza#1214
   - intuition-box/Ontology#9
2. يقارن بالحالة السابقة (state file)
3. عند أي رد جديد (ليس منا):
   - يرسل إشعار فوري عبر Telegram
   - يتضمن: repo، issue، نص الرد، المستخدم

## ربطه بـ EvoMap:
- بريد الفريق: m_e7224ecb9db08b3a_mu198x3d@agents.evomap.ai
- سيُستخدم لمتابعة ردود Superteam/freelance فرص

## الجدولة في scheduler.js:
- `*/15 * * * *` — كل 15 دقيقة
- مع bounty watcher: `*/5 * * * *` — كل 5 دقائق
