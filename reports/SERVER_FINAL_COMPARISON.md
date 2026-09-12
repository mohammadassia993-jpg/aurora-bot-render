# SERVER_FINAL_COMPARISON.md — المقارنة النهائية
التاريخ: 2026-09-12 22:10 UTC

---

## جدول المقارنة

| الميزة | Witchly.host | Pxxl.app | ApexWeave.com | Kubeletto.com |
|--------|-------------|----------|---------------|---------------|
| **الحالة** | ✅ يعمل | ✅ يعمل | ✅ يعمل | ✅ يعمل |
| **Cloudflare** | ✅ | ✅ | ✅ | ✅ |
| **Free tier** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ 14 يوم + 120 مهلة | ✅ مجاني بدون بطاقة |
| **Node.js** | ⚠️ غير موثّق | ✅ مؤكد | ✅ مؤكد | ✅ مؤكد |
| **Docker** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ مؤكد | ✅ مؤكد |
| **Python** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ مؤكد | ✅ مؤكد |
| **Redis** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ مؤكد | ⚠️ (env vars فقط) |
| **GitHub deploy** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ Git push | ✅ Auto-deploy |
| **HTTPS تلقائي** | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ مؤكد | ✅ Wildcard + SSL |
| **CLI** | ❌ | ❌ | ⚠️ غير موثّق | ✅ kubeletto CLI |
| **Autoscale** | ⚠️ غير موثّق | ⚠️ غير موثّق | ⚠️ غير موثّق | ✅ Scale-to-zero |
| **التسجيل** | Discord OAuth | متصفح | بريد + CAPTCHA | GitHub OAuth |
| **API عمومي** | ❌ | ❌ | ❌ | ⚠️ (SPA) |

---

## الترتيب حسب الأفضلية

### 🥇 1. Kubeletto.com (الأقوى تقنياً)
- **الميزة الأقوى**: Kubernetes-native + Free بدون بطاقة + GitHub auto-deploy + HTTPS تلقائي + Autoscale
- **الميزة**: *.kubeletto.app URL مجاني + Wildcard SSL + Live logs + Rollback
- **العائق**: يحتاج GitHub OAuth login + CLI يحتاج x86_64
- **التقييم**: ⭐⭐⭐⭐ (4/5)

### 🥈 2. ApexWeave.com (الأكثر شمولاً)
- **الميزة الأقوى**: Free tier موثق + Redis + Postgres + Git push to deploy
- **الميزة**: 14 يوم production + 120 يوم مهلة + No card + Docker + Multiple stacks
- **العائق**: 14 يوم فقط كتجربة، ثم يصبح مدفوع. يحتاج بريد + CAPTCHA
- **التقييم**: ⭐⭐⭐⭐ (4/5)

### 🥉 3. Witchly.host (الأخف)
- **الميزة**: Discord OAuth فقط، بسيط
- **العائق**: لا تفاصيل مجانية واضحة، يحتاج Discord OAuth
- **التقييم**: ⭐⭐⭐ (3/5)

### 4. Pxxl.app (الأضعف)
- **الميزة**: المنصة أفريقية (Nigeria)
- **العائق**: لا تفاصيل مجانية واضحة، لا وثائق، لا CLI
- **التقييم**: ⭐⭐ (2/5)

---

## التوصية النهائية

### ✅ Kubeletto.com — مُختار كنسخة احتياطية لـ Render
- مجاني بدون بطاقة ائتمان
- GitHub deploy تلقائي (مثل Render)
- HTTPS wildcard مجاني
- Kubernetes-native infrastructure
- Autoscale (يمكن ضبطه لعدم النوم)
- Rollback + Live logs

### الإجراء التالي المطلوب
1. سجّل عبر GitHub OAuth على kubeletto.com
2. اربط مستودع aurora-bot-render
3. اضبط `kubeletto env set` للمتغيرات البيعية
4. انشر.docker أو Dockerfile
5. اختبر البوت عليه

### ⚠️ ملاحظة مهمة
Kubeletto في وضع **Beta** — قد يكون هناك تغييرات في الأسعار أو الميزات في المستقبل.
ApexWeave بديل قوي (14 يوم مجاني كحد أدنى).
