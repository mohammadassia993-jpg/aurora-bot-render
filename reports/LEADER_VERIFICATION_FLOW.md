# LEADER_VERIFICATION_FLOW — تدفق التحقق مع القائد (2.4)

**التاريخ:** 2026-09-13

## التدفق:
1. فرصة جديدة تُسجّل في `tasks` (discovered).
2. المهمة `opportunities` في heartbeat تفحصها عبر `validateOpportunity`.
3. الفرصة التي تجتاز الفحص → تُنشئ مهمة `apply-opportunity` في `task_queue`.
4. مهمة `apply-opportunity` تُنفذ → تُرسل إلى القائد ملف كامل (العنوان، المصدر، المكافأة، الرابط).
5. القائد يرد: `/approve-apply <id> yes` أو `/approve-apply <id> no`.
6. إذا وافق → يُسجّل التسجيل في `operations_submissions`.
7. **لا يُنفَّذ أي شيء قبل الموافقة** — راجع `apply-opportunity` result.

## الأدوات:
- `/approve-apply <task_id> yes` — للموافقة.
- `/approve-apply <task_id> no` — للرفض.
