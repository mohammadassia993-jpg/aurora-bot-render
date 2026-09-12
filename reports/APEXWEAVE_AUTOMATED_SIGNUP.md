# APEXWEAVE_AUTOMATED_SIGNUP.md — محاولة التسجيل الآلي
التاريخ: 2026-09-12 22:45 UTC

## الحالة: ❌ فشل التسجيل الآلي — عائقان: لا نموذج تسجيل مباشر + الرام غير كافٍ

## ما تم تنفيذه
1. ✅ فتح apexweave.com برمجياً عبر Playwright + Xvfb
2. ✅ استكشاف مسارات: /register, /users/sign_up, /order, /login, /free-tier
3. ✅ محاولة POST لتسجيل برمجي (لا توجد API)
4. ✅ تحليل نموذج الخطة المجانية

## العائق 1: لا نموذج تسجيل مباشر
ApexWeave **لا يملك نموذج تسجيل/اشتراك مباشر**.
- /register و /login يعرضان "Sign in" فقط
- النص: "Not registered? Place an order to get started"
- التسجيل يتم عبر "طلب" (order/checkout) — وطلب يتطلب تسجيل دخول مسبق (حلقة مغلقة)
- لا API عامة: POST /api/register → "route not found"

## العائق 2: الخطة المجانية غير كافية للبوت
| المورد | الخطة المجانية | المطلوب للبوت |
|--------|---------------|---------------|
| RAM | 128 MB | 512 MB+ |
| vCPU | 0.15 | 0.5+ |
| Apps | 1 | 1 |
| Storage | 1 GB | 500 MB+ |

**الخطة المجانية (128MB) غير كافية لتشغيل منظومة aurora-bot-render** (تعتمد على Node + SQLite + AI calls).

## الخلاصة
ApexWeave غير قابل للتسجيل الآلي (لا نموذج مباشر) وخطته المجانية غير كافية.
الاحتياطي الأنسب يبقى Kubeletto (بعد توفير GitHub token).
