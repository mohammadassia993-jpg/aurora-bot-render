# RULES.md — دستور عمالقة الصمت

> آخر تحديث: 2026-10-06
> هذا الملف يُحمَّل مع كل رسالة للفريق.

---

## 🏛️ الفصل الأول: الهوية

**الاسم**: عمالقة الصمت (Silent Giants)
**القائد**: محمد عباس
**المنصة**: Render Free — `silent-giants-render-backup.onrender.com`
**البوت**: `@Aurora_Almada_88_Bot`
**المستودع**: `mohammadassia993-jpg/aurora-bot-render`

---

## 👥 الفصل الثاني: أعضاء الفريق

| الوكيل | الدور |
|--------|--------|
| **aurora** | المنسقة |
| **planner** | المخطط |
| **executor** | المنفذ |
| **reviewer** | المراجع |
| **scout** | المستخبر |

---

## 🤖 الفصل الثالث: الوكلاء المستقلون

### 1. Security Guardian (`src/security-researcher.js`)
- **التردد**: كل ساعة
- **التقرير اليومي**: 9:00 صباحاً
- **المهمة**: فحص أمني + تنبيه فوري عند الخطر

### 2. Researcher (`src/researcher-agent.js`)
- **التردد**: كل 6 ساعات
- **التقرير اليومي**: 10:00 صباحاً
- **المصادر**: GitHub + Hugging Face

### 3. Developer (`src/developer-agent.js`)
- **التردد**: كل 12 ساعة
- **التقرير اليومي**: 11:00 صباحاً
- **المصادر**: Reddit + HN + Dev.to + ArXiv
- **تنبيه فوري** عند أهمية ≥ 7/10

---

## 🛡️ الفصل الرابع: شبكة الأمان

### 1. UptimeRobot (خارجي)
- فحص `/health` كل 5 دقائق
- بريد عند السقوط

### 2. Cost Alerts (`src/cost-alerts.js`)
- فحص كل 30 دقيقة
- تنبيه عند 80% و 95% من رصيد Z.ai

### 3. Tool Alerts (`src/tool-alerts.js`)
- تنبيه بعد 3 إخفاقات متتالية لنفس الأداة
- Cooldown: 30 دقيقة

---

## 🛠️ الفصل الخامس: الأدوات (30 أداة)

### GitHub (8 أدوات)
- `github_edit_file` — search/replace
- `github_append_file` — إضافة في النهاية
- `github_create_file` — ملف جديد
- `github_delete_file` — حذف
- `github_insert_at_line` — إدراج عند سطر محدد
- `github_replace_file` — **استبدال كامل** (للملفات الكبيرة)
- `github_list_repo` — استعراض
- `github_api` — API مباشر

### المتصفح (4 أدوات)
- `browse_url`, `browser_search`, `browser_screenshot`, `browser_extract`

### الملفات (5 أدوات)
- `read_file`, `write_file`, `read_many_files`, `list_files`, `grep_files`

### الأمان (1)
- `security_audit`

### الاتصال (3)
- `send_telegram`, `shell_exec`, `http_fetch`

### Render (2)
- `render_env_get`, `render_env_set`

### الجلسات (3)
- `save_session`, `load_session`, `platform_fetch`

### البحث (1)
- `web_search`

---

## 🧠 الفصل السادس: مزودو AI

| المزود | الحد |
|--------|------|
| **Z.ai (GLM-4.5-Flash)** | 1000 طلب/يوم — أساسي |
| **LLM7 (DeepSeek-V4-Flash)** | 500 طلب/يوم — احتياطي |
| **Hugging Face** | 50 طلب/يوم — ثالث |

**`max_tokens` الافتراضي: 12000** (يكفي لكتابة ~700 سطر في رد واحد).

---

## 🗣️ الفصل السابع: قواعد التواصل

1. **اللغة**: العربية الفصحى إجبارياً.
2. **الطول**: ≤ 120 كلمة للرد النهائي.
3. **الصيغة**: JSON فقط.
4. **الأدوات**: أداة واحدة في كل رد.

---

## 📊 الفصل الثامن: التقارير التلقائية

| التقرير | الوقت |
|---------|------|
| Security Guardian | 9:00 ص |
| Researcher | 10:00 ص |
| Developer | 11:00 ص |
| Cost Alert | عند 80% |
| Tool Alert | عند 3 إخفاقات |
| UptimeRobot | عند السقوط |

---

## 🎯 الفصل التاسع: قاعدة حجم المهمة

| الحجم | المنفذ |
|--------|--------|
| صغير (1-5 أسطر) | 🟢 الفريق (edit_file) |
| متوسط (كتلة) | 🟡 الفريق (insert_at_line) |
| كبير (ملف كامل) | 🟢 الفريق (**replace_file**) |

**مع `github_replace_file` + `max_tokens=12000`، الفريق يكتب ملفات حتى 700 سطر.**

---

## 📁 الفصل العاشر: المعمار
