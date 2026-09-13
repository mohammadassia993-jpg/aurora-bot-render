# GITHUB_ACTIONS_HEARTBEAT — تفعيل GitHub Actions كنبض خارجي

**التاريخ:** 2026-09-13 | **المهمة:** 3.1

## الحالة: ⏳ معلق على PAT بصلاحية workflow

### الفحص
- PAT الحالي: صلاحية `repo` فقط — بدون `workflow` ❌
- المحاولة: رفع `.github/workflows/*.yml` → GitHub يرفض بـ 403 (lack of workflow permission)

### الملفات الجاهزة (محلياً)
- `/root/keepalive-local/github-workflows/workflows/heartbeat.yml` — كل 5 دقائق → `/heartbeat`
- `/root/keepalive-local/github-workflows/workflows/send-report.yml` — كل 3 ساعات → `/send-report`

### التفعيل عند توفر الصلاحية
1. ⚠️ **تدخل بشري:** GitHub → Settings → Developer settings → Personal access tokens → إضافة scope `workflow`
2. أو إنشاء GitHub App محلياً بصلاحيات Contents (RW) + Workflows (RW)
3. رفع الملفات → تعمل تلقائياً

### الخط الثانوي الحالي (يعمل الآن)
- الإبقاء المتبادل: `PEER_KEEPALIVE_URL` على كلتا الخدمتين — ضرب كل 5 دقائق ✅

## المخرَج
⏳ ملفات جاهزة — معلق على توليد PAT + workflow scope.
