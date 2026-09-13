# PAT_WORKFLOW_FIX — إصلاح صلاحيات PAT ورفع GitHub Actions

**التاريخ:** 2026-09-13 | **المهمة:** 2.3

## الفحص
- PAT الحالي: صلاحية `repo` فقط — **بدون** scope `workflow`.
- بدون `workflow` لا يمكن دفع ملفات `.github/workflows/*.yml`.

## ما تم تجهيزه
- ملفات الـ workflows جاهزة محلياً: `/root/keepalive-local/github-workflows/workflows/`
  - `heartbeat.yml` — يضرب `/heartbeat` كل 5 دقائق.
  - `send-report.yml` — يستدعي `/send-report` كل 3 ساعات.
- محاولة الرفع فشلت برفض GitHub (403 — lack of workflow permission).

## المطلوب بشري (سبب تقني قاطع)
- **طلب تدخل بشري:** إنشاء PAT جديد أو تحديثه بإضافة scope `workflow` (عبر GitHub → Settings → Developer settings → Personal access tokens).
- أو تفعيل GitHub App الموجود (`GITHUB_APP_SETUP.md`) بصلاحية Contents:write + Workflows.
- بعد الحصول عليه: `git push` لملفات الـ workflows → يعمل النبض من GitHub مباشرة.

## المخرَج
⏳ معلق على صلاحية workflow فقط — كل شيء آخر جاهز.
