import { db, recordError } from './db.js';
import { audit } from './audit.js';
import { callModel, selectModel } from './ai.js';
import { info, warn } from './logger.js';
import { config } from './config.js';

const AGENTS = {
  planner:  { label: '📋 المخطط', role: 'plan' },
  executor: { label: '⚙️ المنفذ', role: 'execute' },
  reviewer: { label: '🔍 المراجع', role: 'review' },
  scout:    { label: '📡 المستخبر', role: 'research' }
};

export function createTask(title, source = 'leader', priority = 'normal') {
  const result = db.prepare(`
    INSERT INTO tasks(source, external_id, title, reward, currency, fit_score, status, risk, payload_json, assigned_agent)
    VALUES (?, ?, ?, 0, '', 70, 'created', 'low', '{}', 'planner')
  `).run(source, `flow-${Date.now()}`, title);
  const taskId = Number(result.lastInsertRowid);
  audit('leader', 'task_created', { taskId, title, priority });
  info('task-flow', `task created: #${taskId} "${title}"`);
  return taskId;
}

export async function runTaskFlow(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return { error: 'task_not_found' };

  const steps = [
    { agent: 'planner',  prompt: `أنت المخطط. حطّل هذه المهمة وخذ خطوات التنفيذ:\n\nالمهمة: ${task.title}\n\nأعطني:\n1. قائمة خطوات التنفيذ\n2. المدة التقديرية\n3. المخاطر المحتملة\n4. المخرجات المتوقعة` },
    { agent: 'executor', prompt: `أنت المنفذ. نفّذ هذه المهمة وأعطني النتيجة:\n\nالمهمة: ${task.title}\n\nنفّذ كل خطوة وسجّل النتيجة.` },
    { agent: 'reviewer', prompt: `أنت المراجع. راجع جودة هذه المهمة:\n\nالمهمة: ${task.title}\n\nأعطني:\n1. تقييم الجودة (0-100)\n2. ملاحظات improvements\n3. هل المهمة جاهزة للتسليم؟` }
  ];

  const results = {};
  for (const step of steps) {
    db.prepare("UPDATE tasks SET status=?, assigned_agent=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(step.agent === 'planner' ? 'planning' : step.agent === 'executor' ? 'executing' : 'reviewing', step.agent, taskId);
    audit(step.agent, 'task_step_started', { taskId, step: step.agent });
    try {
      const output = await callModel(step.agent, step.prompt, taskId);
      results[step.agent] = output;
      db.prepare("UPDATE tasks SET payload_json = json_set(payload_json, '$.step_" + step.agent + "', ?), updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(String(output).slice(0, 5000), taskId);
      audit(step.agent, 'task_step_completed', { taskId, step: step.agent, outputLength: String(output).length });
    } catch (caught) {
      warn('task-flow', `${step.agent} failed for task #${taskId}: ${caught.message}`);
      results[step.agent] = `خطأ: ${caught.message}`;
      recordError('task-flow', 'STEP_FAILED', `${step.agent}: ${caught.message}`);
    }
  }

  db.prepare("UPDATE tasks SET status='done', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId);
  audit('aurora', 'task_completed', { taskId, title: task.title });
  return results;
}

export function getTaskStatus(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    agent: task.assigned_agent,
    created: task.created_at,
    updated: task.updated_at
  };
}

export function getTaskReport() {
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `).all();
  const recent = db.prepare(`
    SELECT id, title, status, assigned_agent, created_at, updated_at
    FROM tasks ORDER BY id DESC LIMIT 10
  `).all();
  const completed = db.prepare(`
    SELECT COUNT(*) as count FROM tasks WHERE status = 'done'
  `).get().count;
  const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  const byAgent = db.prepare(`
    SELECT assigned_agent, COUNT(*) as count FROM tasks WHERE assigned_agent != '' GROUP BY assigned_agent
  `).all();

  const lines = [
    '📊 تقرير المهام الشامل',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    `📈 الإجمالي: ${total} مهمة | مكتملة: ${completed} | متبقية: ${total - completed}`,
    '',
    '📋 حسب الحالة:',
    ...stats.map(s => `  • ${s.status}: ${s.count}`),
    '',
    '👥 حسب الوكيل:',
    ...byAgent.map(a => `  • ${a.assigned_agent}: ${a.count}`),
    '',
    '📝 آخر 10 مهام:',
    ...recent.map(t => `  #${t.id} [${t.status}] ${t.title} — ${t.assigned_agent || 'غير معيّن'}`),
    '',
    `📅 التحديث: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
  ];
  return lines.join('\n');
}

export function isLeaderMessage(sender) {
  const chatId = String(sender.id || '');
  const username = String(sender.username || '').toLowerCase();
  return chatId === String(config.telegramChatId || '') ||
         username === 'mohammadabbas891' ||
         chatId === '888229115';
}

export function matchTaskCommand(text) {
  const lower = (text || '').toLowerCase().trim();
  // Match: "تنفيذ المهمة X", "نفّذ X", "ابدأ X", "/task X", "مهمة X"
  const patterns = [
    /^(?:تنفيذ|نفّذ|ابدأ|افعل|ell执行)\s+(.+)/i,
    /^\/task\s+(.+)/i,
    /^مهمة\s+(.+)/i,
    /^(?:execute|start|run)\s+(.+)/i
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern) || text.trim().match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

export function matchReportCommand(text) {
  const lower = (text || '').toLowerCase().trim();
  return /^(?:تقرير|تقريري|report|التقرير)/i.test(lower);
}

export function matchStatusCommand(text) {
  const lower = (text || '').toLowerCase().trim();
  return /^(?:حالة|status|الحالة)/i.test(lower);
}
