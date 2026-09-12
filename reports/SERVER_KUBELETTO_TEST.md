# SERVER_KUBELETTO_TEST.md — اختبار Kubeletto.com
التاريخ: 2026-09-12 22:05 UTC

## الحالة: ⚠️ غير مكتمل — منصة حقيقية وقوية، التسجيل يحتاج تفاعل متصفح

### ما تم التحقق منه
- ✅ الموقع يعمل: kubeletto.com → HTTP 200
- ✅ منصة Serverless Container (Kubernetes-native)
- ✅ Free tier: "Beta · No credit card required · Free default *.kubeletto.app URL · Live logs included"
- ✅ Deploy من GitHub repo أو Docker image
- ✅ Auto HTTPS: "*.kubeletto.app URL" + automatic SSL + wildcard certs
- ✅ Build: "Sandboxed compilation and caching" + image scanning
- ✅ Autoscaling (including scale to zero)
- ✅ Rollback + traffic splitting
- ✅ Live logs + metrics
- ✅ CLI: kubeletto deploy / logs / rollback / env set
- ✅ Stack: Node.js, Python, Docker
- ⚠️ CLI binaries: متوفرة لكن ليس لـ arm64 (بيئتنا الحالية aarch64)

### تقييم الميزة
- **دعم Node.js**: ✅ مؤكد
- **دعم Docker**: ✅ مؤكد
- **HTTPS تلقائي**: ✅ مؤكد (*.kubeletto.app)
- **غيتHub deploy**: ✅ مؤكد
- **Free**: ✅ مؤكد (no card)
- **عمل 24/7**: ⚠️ يوفر Autoscale-to-Zero (ينام عند الخمول) لكن يمكن ضبطه ليستيقظ عند الطلب

### العائق الرئيسي
التسجيل عبر متصفح + GitHub OAuth. CLI غير متاح لـ arm64 محلياً، لكن يمكن التثبيت من x86 VPS أو استخدام واجهة الويب.

### التوصية
**الأقوى تقنياً** — Kubernetes-native، Free tier بدون بطاقة، GitHub deploy، HTTPS تلقائي.
