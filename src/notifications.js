import { db } from './db.js';
import { audit } from './audit.js';
import { teamEvents } from './team.js';

export async function notify(kind, title, body = '') {
  const result = db.prepare('INSERT INTO notifications(kind,title,body) VALUES (?,?,?)')
    .run(kind, title, String(body).slice(0, 12000));
  teamEvents.emit('notification', { type: kind, notificationId: Number(result.lastInsertRowid) });
  audit('aurora', `notification:${kind}`, { title });
  return { id: Number(result.lastInsertRowid), deliveredToDashboard: true };
}

export function buildDailyDigest() {
  const checks = db.prepare(`
    SELECT component, healthy, detail FROM health_checks
    WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
    ORDER BY component
  `).all();
  const tasks = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY status').all();
  const queue = db.prepare("SELECT status, COUNT(*) AS count FROM mail_queue GROUP BY status").all();
  const importantErrors = db.prepare(`
    SELECT scope, error_type AS type, occurrence_count AS occurrences, last_seen AS seen
    FROM errors
    WHERE resolved=0 AND last_seen >= datetime('now','-24 hours')
    ORDER BY last_seen DESC LIMIT 5
  `).all();
  const agents = db.prepare(`
    SELECT agent, MAX(created_at) AS lastRun FROM agent_runs
    WHERE created_at >= datetime('now','-24 hours') GROUP BY agent ORDER BY agent
  `).all();
  const healthy = checks.filter(item => item.healthy === 1).length;
  const streamStats = source => {
    const rows = db.prepare(`
      SELECT status, COUNT(*) AS count FROM tasks WHERE source = ? GROUP BY status
    `).all(source);
    const applied = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE source = ? AND external_id LIKE 'ht-%'`).get(source).c;
    const ready = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE source = ? AND status = 'ready_for_approval'`).get(source).c;
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return `المقدمة ${applied} | الجاهزة ${ready} | الإجمالي ${total}`;
  };
  const recentResearch = db.prepare(`
    SELECT cycle, opportunities_json FROM research_reports WHERE cycle LIKE 'daily:%'
    ORDER BY rowid DESC LIMIT 1
  `).get();
  const deliverables = db.prepare(`
    SELECT category, COUNT(*) AS count FROM deliverables
    WHERE status = 'ready' GROUP BY category ORDER BY category
  `).all();
  const deliverableTotal = deliverables.reduce((sum, row) => sum + row.count, 0);
  const researchCount = recentResearch
    ? (JSON.parse(recentResearch.opportunities_json || '[]') || []).length
    : 0;
  const lines = [
    '📋 التقرير اليومي الموحد لأورورا',
    `الحالة العامة: ${healthy === checks.length && checks.length > 0 ? 'مستقرة' : 'تحت المراجعة'}`,
    '',
    '🩺 الخدمات:',
    ...checks.map(item => `- ${item.component}: ${item.healthy ? 'سليمة' : 'بحاجة إلى مراجعة'} — ${item.detail}`),
    '',
    '📊 تقرير مسار العمل الحر (Dework):',
    `- ${streamStats('dework')}`,
    '',
    '📊 تقرير مسار Titan/DePIN:',
    `- ${streamStats('titan')}`,
    '',
    '📊 تقرير مسار التوظيف:',
    `- ${streamStats('jobs')}`,
    '',
    '🔎 تقرير نتائج البحث الجديد:',
    `- فرص مؤهلة مكتشفة: ${researchCount}`,
    recentResearch ? `- آخر دورة بحث: ${String(recentResearch.cycle).replace('daily:', '')}` : '- لم تُنفَّذ دورة بحث بعد',
    '',
    '📦 المخرجات الجاهزة (بدون مفاتيح):',
    ...(deliverables.length ? deliverables.map(item => `- ${item.category}: ${item.count}`) : ['- لا يوجد']),
    `- الإجمالي: ${deliverableTotal} ملفاً جاهزاً للتسليم`,
    '',
    `📬 طابور البريد: ${queue.map(item => `${item.status}=${item.count}`).join('، ') || 'فارغ'}`,
    `👥 نشاط الوكلاء خلال ٢٤ ساعة: ${agents.map(item => `${item.agent} (${item.lastRun})`).join('، ') || 'لا يوجد'}`,
    '',
    importantErrors.length ? '⚠️ أهم الأحداث المدمجة:' : '✅ لا أخطاء مهمة متكررة خلال ٢٤ ساعة.',
    ...importantErrors.map(item => `- ${item.scope}/${item.type}: تكرار ${item.occurrences}، آخر مشاهدة ${item.seen}`),
    '',
    'هذا التقرير يُنشأ مرة واحدة يوميًا فقط.'
  ];
  return lines.join('\n');
}

export function publishDailyDigest() {
  const today = new Date().toISOString().slice(0, 10);
  const exists = db.prepare(`
    SELECT id FROM notifications
    WHERE kind='daily_digest' AND date(created_at)=?
    LIMIT 1
  `).get(today);
  if (exists) return { published: false, reason: 'already_published_today' };
  const body = buildDailyDigest();
  const result = db.prepare("INSERT INTO notifications(kind,title,body) VALUES ('daily_digest','التقرير اليومي — الساعة ٠٨:٠٠',?)").run(body);
  audit('aurora', 'daily_digest_published', {});
  return { published: true, id: Number(result.lastInsertRowid), body };
}

export function unreadCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count;
}
