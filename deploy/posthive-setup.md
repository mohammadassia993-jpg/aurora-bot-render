# دليل PostHive — النشر الآلي على 11 منصة

**التاريخ:** 2026-08-28 | **الحالة:** مُثبَّت — يحتاج API key

---

## ما هو PostHive؟

أداة حقيقية (posthive.co) لنشر المحتوى تلقائياً على منصات متعددة عبر MCP (Model Context Protocol):
- Bluesky, Threads, LinkedIn, Instagram, Mastodon
- X/Twitter, Facebook, Reddit, Telegram, Discord, YouTube

## التثبيت (تم)

```bash
npm install -g posthive-mcp
```

## التفعيل (خطوة واحدة من القائد)

1. افتح `https://posthive.co`
2. سجّل حساباً مجانياً
3. احصل على API Key من الإعدادات
4. أرسل المفتاح هنا

## بعد التفعيل

```bash
export POSTHIVE_API_KEY="your-key"
posthive-mcp  # يبدأ الخادم
```

سيُنشر المحتوى الجديد تلقائياً لجميع المنصات.

---
*توثيق PostHive — فريق عمالقة الصمت*
