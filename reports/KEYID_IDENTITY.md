# KEYID_IDENTITY.md — KeyID (هوية البريد الإلكتروني)

**التاريخ:** 2026-09-14
**الحالة:** ⚠️ مثبت — يحتاج project key مدفوع

## النتائج:
- **التثبيت:** ✅ ناجح (v0.4.3)
- **العنوان:** https://keyid.ai
- **الوصف:** Free email for AI agents. No signup, no human needed.
- **GitHub:** https://github.com/KeyID-AI/sdk-py

## blockers:
```
KeyIDError: Project key required
```

## السبب:
KeyID أغلقت المجمع المجاني (shared pool) بسبب سوء الاستخدام (bulk account-farming).
- المفتاح المجاني: ❌ مغلق
- المفتاح المدفوع: مطلوب
- "Provisioning requires a project key. The open shared pool is closed."

## ما نجح:
- التثبيت: ✅
- إنشاء KeyID agent: ✅
- استكشاف API: ✅ (70+ طريقة: provision, send, receive, inbox, threads, etc.)

## ما يحتاج project key:
- `agent.provision()` → يحتاج project_key
- `agent.send()` → يحتاج project_key
- `agent.get_inbox()` → يحتاج project_key

## الأدوات المتاحة (بعد الحصول على المفتاح):
- provision, send, receive, reply, forward
- get_inbox, get_message, get_thread
- create_contact, create_webhook, create_draft
- search, metrics, reputation
