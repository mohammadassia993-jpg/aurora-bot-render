# تقييم QMM Digital وأتمتة النشر — (2026-08-29)

## الحقيقة: QMM Digital ليست منصة بيع/API

**QMM Digital (qmm.digital)** — فحص فعلي:
- موقع يعمل (HTTP 200) لكنه **منصة دورات تدريبية مغلقة** بالعربية ("7 تخصصات رقمية"، برنامج إحالة `/referrals`، لوحة `/admin`).
- **لا يوجد API عام** لرفع منتجات خارجية أو أتمتة بيع:
  - لا `docs`، لا `developer`، لا `webhook`.
  - الـ endpoints الوحيدة: `/auth`, `/checkout/return`, `/api/broadcast` (رسائل بث داخلية), `/purchases`, `/referrals`, `/withdrawals` — كلها داخليّة تخص دوراتها.
- **الخلاصة:** QMM Digital **منافس** (يبيع دورات لبناء دخل)، وليست قناة بيع لمنتجاتنا. لا يمكن نشر منتجاتنا عليها.

## الخيار العملي الحقيقي لأتمتة النشر (من بيئتنا)

الأدوات الحقيقية المراجعة:
| الأداة | الحالة | التفعيل |
|--------|--------|---------|
| **PostHive MCP** | ✅ مثبّت (`/usr/local/bin/posthive-mcp`) | يحتاج OAuth بشري مرة واحدة (`posthive-cli login`) |
| Make.com | حقيقي (وصول API) | يحتاج حساب (بريد الفريق) + OAuth |
| n8n | حقيقي (Self-host) | يحتاج VPS |
| Taisly/SocialCannon | يُفحَص | غالباً OAuth بشري |
| Instagram Graph API | حقيقي | يحتاج Facebook Business + App (بشري/بطاقة) |

### القرار
- **PostHive** هو الخيار الأفضل المثبّت فعلاً: يدعم X, LinkedIn, Instagram (Reels/Stories), YouTube, Telegram وغيرها عبر MCP.
- قائمة المنشورات جاهزة: `deploy/posthive/content-queue.json` (6 منشورات).
- **العائق الوحيد:** ربط الحسابات عبر `npx posthive-cli login` يتطلب متصفحاً وتأكيداً **بشرياً مرة واحدة** (لا يمكن أتمتته بالكامل — طبيعة OAuth).

## الخطة التنفيذية (جاهزة للتفعيل فور نجاح OAuth)
1. ربط حسابات X + LinkedIn + Instagram (يدوياً مرة واحدة عبر `posthive-cli login`).
2. ضبط `POSTHIVE_API_KEY` في `.env`.
3. تشغيل `deploy/posthive/workflow.md` لجدولة 6 منشورات.
4. إضافة تعليقات أولى وروابط المتجر لتعزيز المبيعات.

## توصية بخصوص QMM
- عدم استهداف QMM كقناة بيع.
- التركيز على: PostHive (نشر) + المتجر المباشر (USDT) + GitHub Pages.
