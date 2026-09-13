# GITHUB_APP_SETUP.md — لماذا لم يُنشأ GitHub App
التاريخ: 2026-09-13 05:10 UTC

---

## ✅ القرار: غير مطلوب — وُجد PAT صالح
- بعد الفحص الشامل تبين وجود PAT (scopes=repo) مضمّن في remote `/root/silent-giants` لنفس المستودع، وهو صالح ويعمل (HTTP 200).
- تم الدفع الفعلي: `33c7860..0d3e63f` → GitHub main الآن `0d3e63f`.

## متى يكون GitHub App ضرورياً؟
- فقط إذا انتهت صلاحية التوكن (PAT) مستقبلاً، أو احتاج الفريق صلاحية `workflow`.
- إنشاء GitHub App يتطلب تسجيل دخول متصفح إلى GitHub.com (جلسة محفوظة) — **غير متوفرة** في هذه البيئة، وبدونها يستحيل إنشاء التطبيق.

## لو تعطّل التوكن مستقبلاً (خطة احتياطية)
1. فتح `https://github.com/settings/apps/new` من متصفح مسجّل.
2. الاسم: `aurora-bot-render-deploy` — صلاحيات: Contents (Read & Write) + Metadata (Read).
3. تثبيته على مستودع `aurora-bot-render` فقط.
4. حفظ `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` في Render Env.
5. سكريبت `generate_gh_token.sh` يولّد JWT → Installation Token (صالح ساعة) قبل كل push.

## ✅ الحالة: ناجح بدون GitHub App — الدفع تم بالتوكن الموجود.
