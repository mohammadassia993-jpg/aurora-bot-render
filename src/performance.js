import { db } from './db.js';

const kpis = [
  { agent: 'aurora', role: 'المنسق', indicators: ['دقة التقارير 100%', 'زمن تصنيف العائق أقل من ساعتين', 'لا مهمة بلا مسؤول محدد'] },
  { agent: 'planner', role: 'المخطط', indicators: ['تعريف إنجاز مكتوب لكل مهمة', 'قائمة التنفيذ قبل أي تنفيذ', 'مراجعة الأولويات يومياً'] },
  { agent: 'executor', role: 'المنفذ', indicators: ['مسودة أولية خلال دور عمل واحد', 'نجاح اختبارات 100% قبل التسليم', 'صفر نشر بدون دليل صحة'] },
  { agent: 'reviewer', role: 'المراجع', indicators: ['مراجعة كل تسليم قبل الإرسال', 'معدل عيوب هاربة أقل من 5%', 'كل تقرير يفرّق فعلي عن محاكاة'] },
  { agent: 'scout', role: 'المستخبر', indicators: ['فحص القنوات كل 15 دقيقة', 'تقرير اتجاه أسبوعي', 'تصفية الفرص منخفضة المخاطر'] }
];

export function performancePlan() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const taskCounts = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY count DESC').all();
  const sourceCounts = db.prepare(`
    SELECT source, COUNT(*) AS total,
           SUM(CASE WHEN status IN ('submitted','delivered','paid') THEN 1 ELSE 0 END) AS completed
    FROM tasks GROUP BY source
  `).all();
  const agentMetrics = db.prepare(`
    SELECT agent, COUNT(*) AS runs, AVG(success) AS successRate,
           AVG(latency_ms) AS avgLatencyMs, AVG(quality_score) AS avgQuality
    FROM agent_runs WHERE created_at >= ? GROUP BY agent
  `).all(cutoff);
  return {
    bottlenecks: [
      'تداخل أدوار التنفيذ مع الاستكشاف دون بوابة انتقال واضحة',
      'غياب تعريف إنجاز قابل للقياس لبعض المهام',
      'تشغيل أساسي على جهاز الهاتف وشبكته المتغيرة',
      'ضعف تسلسل التواصل بين المخطط والمنفذ والمراجع'
    ],
    workflow: [
      'المخطط يحوّل الطلب إلى معيار إنجاز ومخرجات محددة',
      'المنفذ ينشئ مسودة ويشغّل الفحوصات المحلية فقط',
      'المراجع يعتمد التسليم أو يرجعه بسبب محدد',
      'أورورا تجمع الدليل وتقدم تقريراً واحداً للقائد',
      'المستخبر يراقب الأثر بعد التسليم ويحدد الانحرافات'
    ],
    kpis,
    metrics: { taskCounts, sourceCounts, agentRuns7d: agentMetrics },
    escalation: [
      'أي اعتماد خارجي مفقود يُسجل فوراً كعائق ولا يُحسب إنجازاً',
      'أي نشر يتطلب دليل صحة فعلي ورابط قابل للفحص',
      'أي تقارير بلا message_id أو حالة طابور مؤكدة تعتبر غير مكتملة'
    ]
  };
}
