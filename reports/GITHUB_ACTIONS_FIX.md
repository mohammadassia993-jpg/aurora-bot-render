# GITHUB_ACTIONS_FIX — حل GitHub Actions

**التاريخ:** 2026-09-13

## المحاولة
1. PAT الحالي: `repo` scope فقط (بدون `workflow`) → 403 على رفع workflow files
2. إنشاء GitHub App يتطلب web UI login (اسم مستخدم + كلمة مرور) — لا نملك كلمة المرور

## الملفات الجاهزة
- `/root/keepalive-local/github-workflows/workflows/heartbeat.yml` — كل 5 دقائق → /heartbeat
- `/root/keepalive-local/github-workflows/workflows/send-report.yml` — كل 3 ساعات → /send-report

## السبب التقني القاطع
لا يمكن إنشاء GitHub App أو توليد PAT جديد من الخادم لأن:
- PAT يتطلب web UI login → لا نملك كلمة مرور GitHub
- GitHub App يتطلب web UI login → نفس المشكلة

## المطلوب من القائد
1. GitHub → Settings → Developer settings → Tokens → New token
2. اختر scopes: `repo` + `workflow`
3. أرسل التوكن الجديد

## المخرَج
❌ لا يمكن التوليد بدون كلمة مرور GitHub.
