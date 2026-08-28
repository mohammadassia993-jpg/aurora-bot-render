# سير عمل النشر الآلي عبر PostHive

**التاريخ:** 2026-08-28 | **الحالة:** كود وتنسيق جاهز — يحتاج حساب لتفعيله

---

## الحقيقة

PostHive (posthive.co) أداة حقيقية تدعم:
- X (Twitter), LinkedIn, Telegram, Bluesky, Instagram, Mastodon, Facebook, YouTube, Pinterest, Nostr, Threads

**لا يدعم** Gumroad (لأنه أداة تواصل اجتماعي، لا متجر).

---

## ما هو جاهز مسبقاً

1. **PostHive MCP** — مُثبَّت في `/usr/local/bin/posthive-mcp`
2. **قائمة المحتوى** — `deploy/posthive/content-queue.json` (4 منشورات جاهزة)
3. **سير العمل** — هذا الملف

---

## ما هو مطلوب من القائد (مرة واحدة)

```bash
# الخطوة 1: تسجيل الدخول (يتطلب متصفحاً)
npx posthive-cli login
# → يفتح متصفحاً لتوثيق حساب X/LinkedIn/Telegram

# الخطوة 2: بعد الربط، شغّل النشر
posthive-cli posts:create --content "..." --accounts <id1,id2>
```

---

## الخطوات الفعلية للنشر التلقائي

بعد تسجيل الدخول وربط الحسابات:

```bash
# احصل على معرّفات الحسابات
posthive-cli accounts:list

# أنشئ منشوراً مجدولاً
posthive-cli posts:create \
  --content "📚 مكتبة محتوى Web3 بالعربية..." \
  --accounts "acc1,acc2" \
  --schedule "2026-08-29T10:00:00Z"
```

---

## ملاحظة أمنية

الربط يتطلب حساب PostHive مجانياً + ربط حسابات التواصل عبر OAuth (متاح من جهاز القائد فقط). لا يمكن للفريق تنفيذ ذلك آلياً لأن OAuth يتطلب متصفحاً.

---
*سير عمل النشر — فريق عمالقة الصمت*
