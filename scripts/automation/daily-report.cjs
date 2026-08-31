const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(process.env.HOME, 'silent-giants/deliverables/reports');
const AUDIT_LOG = path.join(process.env.HOME, 'silent-giants/deliverables/superteam-applications/audit-log.md');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, `daily-report-${today}.md`);
  
  // Read audit log
  const auditContent = fs.existsSync(AUDIT_LOG) ? fs.readFileSync(AUDIT_LOG, 'utf8') : 'No audit data';
  
  // Count submissions
  const submissionLines = auditContent.split('\n').filter(line => line.includes('|') && !line.includes('---') && !line.includes('#') && line.includes('202'));
  
  const report = `# 📊 التقرير اليومي — ${today}
**فريق عمالقة الصمت**

---

## 📈 ملخص اليوم

- **التاريخ:** ${today}
- **إجمالي التقديمات:** ${submissionLines.length}
- **الحالة:** جاري العمل

---

## 📋 سجل التقديم

${auditContent.split('## 📝 سجل التقديمات')[1] || 'لا توجد تقديمات بعد'}

---

## 🎯 المهام المقبلة

1. متابعة التقديمات الموجودة
2. توسيع التقديم لفرص جديدة
3. تحسين المحتوى بناءً على الملاحظات

---

## 💰 الإحصائيات المالية

| البيان | القيمة |
|---|---|
| إجمالي الجوائز المحتملة | ~24,400$ |
| التقديمات المقبولة | 0 |
| الإيرادات المحققة | 0$ |

---

**التقرير أعدّه تلقائياً بواسطة نظام عمالقة الصمت**
`;

  fs.writeFileSync(reportPath, report);
  console.log(`📊 Daily report generated: ${reportPath}`);
  return reportPath;
}

generateDailyReport();
