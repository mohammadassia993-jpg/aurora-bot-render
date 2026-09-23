/**
 * task-queue.js — Persistent Task Queue + Mission Loop + Agent Loop
 */
import { db } from './db.js';
import { info, warn } from './logger.js';
import { sendMessageDetailed } from './telegram.js';
import { audit } from './audit.js';
import { executeTool, AVAILABLE_TOOLS } from './tool-executor.js';

try { db.exec('PRAGMA foreign_keys = OFF;'); } catch { /* ignore */ }

// ─── Schema ───
db.exec(`
CREATE TABLE IF NOT EXISTS task_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  category TEXT DEFAULT 'general',
  type TEXT DEFAULT 'one-time',
  recurring_interval TEXT DEFAULT '',
  last_run_at TEXT DEFAULT '',
  next_run_at TEXT DEFAULT '',
  archived INTEGER DEFAULT 0,
  result TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS task_queue_pending ON task_queue(status, priority);
CREATE INDEX IF NOT EXISTS task_queue_next ON task_queue(status, type, next_run_at);
`);

for (const [column, definition] of [
  ["type", "TEXT DEFAULT 'one-time'"],
  ["recurring_interval", "TEXT DEFAULT ''"],
  ["last_run_at", "TEXT DEFAULT ''"],
  ["next_run_at", "TEXT DEFAULT ''"],
  ["archived", "INTEGER DEFAULT 0"]
]) {
  try { db.exec(`ALTER TABLE task_queue ADD COLUMN ${column} ${definition}`); }
  catch (error) { if (!String(error).includes('duplicate column name')) throw error; }
}

function parseInterval(value) {
  const match = String(value || '').match(/^(\d+)\s*(min|mins|minute|minutes|h|hour|hours|d|day|days)?$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = (match[2] || 'h').toLowerCase();
  if (unit.startsWith('d')) return n * 24 * 60;
  if (unit.startsWith('m')) return n;
  return n * 60;
}

function safeAudit(actor, action, detail) {
  try { audit(actor, action, detail); } catch { /* ignore */ }
}

export function addTask(description, category = 'general', priority = 5, opts = {}) {
  const type = opts.type === 'recurring' ? 'recurring' : (opts.type === 'on-demand' ? 'on-demand' : 'one-time');
  const recurring = String(opts.recurring || '');
  let nextRunAt = String(opts.next_run_at || '');
  if (type === 'recurring' && !nextRunAt) {
    const intervalMin = parseInterval(recurring);
    if (intervalMin > 0) nextRunAt = new Date(Date.now() + intervalMin * 60000).toISOString();
  }
  const res = db.prepare(`
    INSERT INTO task_queue(description, status, priority, category, type, recurring_interval, next_run_at)
    VALUES (?, 'pending', ?, ?, ?, ?, ?)
  `).run(description, priority, category, type, recurring, nextRunAt);
  info('task-queue', `queue +${res.lastInsertRowid} [${category}/${type}] ${description.slice(0, 60)}`);
  return res.lastInsertRowid;
}

export function addRecurringTask(description, category, interval, priority = 5) {
  return addTask(description, category, priority, { type: 'recurring', recurring: interval });
}

export function hasPending(category) {
  return db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status='pending' AND category = ?").get(category).c > 0;
}

function requeueStaleActive() {
  db.prepare(`
    UPDATE task_queue SET status='pending', updated_at=CURRENT_TIMESTAMP
    WHERE status='active' AND updated_at < datetime('now', '-30 minutes')
  `).run();
}

export function nextTask() {
  requeueStaleActive();
  const nowIso = new Date().toISOString();
  const task = db.prepare(`
    SELECT * FROM task_queue
    WHERE status = 'pending' AND archived = 0
      AND (type != 'recurring' OR next_run_at = '' OR next_run_at <= ?)
    ORDER BY
      CASE type WHEN 'on-demand' THEN 0 WHEN 'one-time' THEN 1 ELSE 2 END,
      priority DESC,
      id ASC
    LIMIT 1
  `).get(nowIso);
  if (task) {
    let nextRunAt = '';
    if (task.type === 'recurring') {
      const intervalMin = parseInterval(task.recurring_interval);
      if (intervalMin > 0) nextRunAt = new Date(Date.now() + intervalMin * 60000).toISOString();
    }
    db.prepare(`UPDATE task_queue SET status='active', last_run_at=?, next_run_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nowIso, nextRunAt, task.id);
  }
  return task || null;
}

export function markDone(id, result = 'done') {
  const task = db.prepare('SELECT * FROM task_queue WHERE id = ?').get(id);
  if (task?.type === 'recurring') {
    db.prepare(`UPDATE task_queue SET status='pending', result=?, last_run_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(result).slice(0, 1000), id);
    safeAudit('executor', 'task_queue_recurring', { taskId: id });
  } else {
    db.prepare(`UPDATE task_queue SET status='done', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(result).slice(0, 1000), id);
    safeAudit('executor', 'task_queue_done', { taskId: id });
    info('task-queue', `done #${id}: ${String(result).slice(0, 50)}`);
  }
  return { ok: true, taskId: id };
}

export function archiveDoneTasks(olderThanDays = 3) {
  const res = db.prepare(`
    UPDATE task_queue SET archived = 1, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'done' AND archived = 0 AND created_at < datetime('now', ?)
  `).run(`-${olderThanDays} days`);
  return res.changes;
}

export function getQueueStats() {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM task_queue WHERE archived = 0 GROUP BY status").all();
  const stats = Object.fromEntries(rows.map(r => [r.status, r.c]));
  const byType = db.prepare(`SELECT type, COUNT(*) c FROM task_queue WHERE status != 'done' AND archived = 0 GROUP BY type`).all();
  const types = Object.fromEntries(byType.map(r => [r.type, r.c]));
  return {
    pending: stats.pending || 0,
    active: stats.active || 0,
    done: stats.done || 0,
    total: rows.reduce((s, r) => s + r.c, 0),
    types
  };
}

export function seedDefaultQueue() {
  const count = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;
  if (count > 0) return { seeded: 0, pending: count };
  const defaults = [
    ['فحص bounties على Superteam و Immunefi (≥$200)', 'bounty-claim', 9],
    ['تحليل عقود Immunefi صغيرة', 'immunefi-analysis', 8],
    ['البحث عن فرصة جديدة على Superteam', 'superteam-apply', 8],
    ['مراجعة جودة التقارير', 'quality-submission', 7],
    ['تدقيق صحة النظام', 'maintenance', 4]
  ];
  for (const [desc, cat, pri] of defaults) {
    if (!hasPending(cat)) addTask(desc, cat, pri);
  }
  return { seeded: defaults.length };
}

// ─── Agent Loop (LLM JSON + Tool Execution) ───
function buildSystemPrompt(agentName) {
  const toolsList = AVAILABLE_TOOLS.map(t =>
    `- ${t.name}: ${t.description}\n  params: ${JSON.stringify(t.params)}`
  ).join('\n');

  return `أنت وكيل "${agentName}" في نظام "عمالقة الصمت".

قاعدة صارمة: أعد كائن JSON واحد فقط. لا نص قبله أو بعده. لا Markdown. لا شرح.

شكل الرد:
{
  "action": "call_tool" | "final_report",
  "tool": "اسم الأداة (فقط إذا action=call_tool)",
  "params": { ... },
  "report": "النص النهائي (فقط إذا action=final_report)"
}

الأدوات المتاحة:
${toolsList}

تعليمات:
- إذا احتجت معلومة أو إجراءً، استدعِ أداة.
- بعد كل أداة، ستصلك النتيجة الحقيقية من النظام.
- عندما تنتهي المهمة، أعد final_report بملخص صريح.
- لا تكذب. لا تدّعِ تنفيذاً لم يحدث.`;
}

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(String(text).trim()); } catch {}
  const start = String(text).indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function runLeaderCommandLoop(task, maxSteps = 6) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.CHAT_ID || '888229115';
  const agentName = 'aurora';
  const systemPrompt = buildSystemPrompt(agentName);
  let conversation = `أمر القائد: ${task.description}\n\nابدأ. أعد JSON فقط.`;

  for (let step = 1; step <= maxSteps; step++) {
    let raw;
    try {
      const { callModel } = await import('./ai.js');
      raw = await callModel(agentName, `${systemPrompt}\n\n${conversation}`);
    } catch (e) {
      warn('agent-loop', `LLM failed step ${step}: ${e.message}`);
      await sendMessageDetailed(`⚠️ خطأ في الاتصال بالـ LLM: ${e.message}`, chatId).catch(() => {});
      return `LLM failure: ${e.message}`;
    }

    const parsed = extractJSON(raw);
    if (!parsed || !parsed.action) {
      conversation += `\n\n[نظام]: ردك لم يكن JSON صالحاً. أعد JSON فقط بدون أي نص إضافي.`;
      continue;
    }

    if (parsed.action === 'final_report') {
      const report = String(parsed.report || '(بدون تقرير)');
      await sendMessageDetailed(`📋 <b>تقرير الفريق</b>\n${report}`, chatId).catch(() => {});
      info('agent-loop', `Task #${task.id} completed in ${step} steps`);
      return `completed: ${report.slice(0, 200)}`;
    }

    if (parsed.action === 'call_tool' && parsed.tool) {
      const toolResult = await executeTool(parsed.tool, parsed.params || {});
      info('agent-loop', `step ${step}: tool ${parsed.tool} → ${toolResult.ok ? 'ok' : 'fail'}`);
      const observation = toolResult.ok
        ? `نتيجة ${parsed.tool}: ${JSON.stringify(toolResult.result).slice(0, 1500)}`
        : `فشل ${parsed.tool}: ${toolResult.error}`;
      conversation += `\n\n${observation}\n\nاستمر: call_tool أو final_report.`;
      continue;
    }

    conversation += `\n\n[نظام]: شكل JSON غير مفهوم.`;
  }

  await sendMessageDetailed(`⚠️ المهمة #${task.id} تجاوزت ${maxSteps} خطوات.`, chatId).catch(() => {});
  return `max steps exceeded`;
}

// ─── Mission Loop ───
export function missionLoop() {
  // 🛡️ احترام مفتاح MISSION_LOOP_DISABLED
  if (process.env.MISSION_LOOP_DISABLED === 'true') {
    return { created: [], pending: 0, disabled: true };
  }

  const created = [];
  const pending = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;

  try {
    const messages = db.prepare(`
      SELECT id, body, created_at FROM messages
      WHERE sender = 'leader' AND created_at >= datetime('now', '-15 minutes')
      ORDER BY id DESC LIMIT 5
    `).all();
    for (const msg of messages) {
      const desc = `أمر من القائد: ${String(msg.body).slice(0, 400)}`;
      const existing = db.prepare(`
        SELECT id FROM task_queue
        WHERE category='leader-command' AND description = ?
        AND created_at >= datetime('now', '-15 minutes') LIMIT 1
      `).get(desc);
      if (!existing) {
        created.push(addTask(desc, 'leader-command', 10));
      }
    }
  } catch (e) { /* messages table may not exist yet */ }

  if (pending >= 5) return { created, pending };

  const revenueCategories = [
    ['bounty-claim', 'متابعة bounties ≥$200', 9],
    ['immunefi-analysis', 'تحليل عقد صغير Immunefi', 8],
    ['superteam-apply', 'مراجعة Superteam Earn', 8],
    ['quality-submission', 'مراجعة جودة آخر تقديم', 7]
  ];
  for (const [cat, desc, prio] of revenueCategories) {
    if (!hasPending(cat)) created.push(addTask(desc, cat, prio));
  }

  archiveDoneTasks(3);
  return { created, pending: db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status='pending'").get().c };
}

// ─── Execute One Task ───
export async function executeTask(task) {
  const cat = task.category;
  try {
    if (cat === 'leader-command') {
      return await runLeaderCommandLoop(task);
    }
    if (cat === 'email') {
      const { checkEmail } = await import('./watchdog.js');
      if (typeof checkEmail === 'function') await checkEmail();
      return 'email checked';
    }
    if (cat === 'opportunities' || cat === 'bounty-claim') {
      const { scanRealOpportunities } = await import('./opportunity-scan.js');
      if (typeof scanRealOpportunities === 'function') await scanRealOpportunities();
      return `${cat} ran`;
    }
    if (cat === 'marketing') {
      const { runMarketingPublish } = await import('./operations.js');
      if (typeof runMarketingPublish === 'function') await runMarketingPublish();
      return 'marketing posted';
    }
    if (cat === 'maintenance') {
      const integrity = db.prepare('PRAGMA integrity_check').get();
      return `integrity=${integrity?.integrity_check || 'ok'}`;
    }
    return 'task executed (general)';
  } catch (e) {
    warn('task-queue', `execute failed #${task.id}: ${e.message}`);
    return `FAILED: ${e.message}`;
  }
}

export async function runHeartbeat() {
  let task = nextTask();
  if (!task) {
    seedDefaultQueue();
    task = nextTask();
  }
  let result = 'no task';
  if (task) {
    result = await executeTask(task);
    try { markDone(task.id, result); } catch (e) { warn('task-queue', `markDone failed #${task.id}: ${e.message}`); }
  }
  let refill = { created: [] };
  try { refill = missionLoop(); } catch (e) { warn('task-queue', `missionLoop failed: ${e.message}`); }
  return {
    ok: true,
    executed: task ? task.id : null,
    description: task ? task.description : null,
    result,
    queue: getQueueStats(),
    refill: refill.created.length
  };
}

export async function sendScheduledReport() {
  const recentReport = (() => {
    try { return db.prepare(`SELECT COUNT(*) c FROM operations_marketing WHERE channel='aurora_report' AND created_at >= datetime('now', '-170 minutes')`).get().c ?? 0; }
    catch { return 0; }
  })();
  if (recentReport > 0) return { delivered: false, skipped: 'window_guard', queue: getQueueStats() };

  const queue = getQueueStats();
  const report = [
    '📊 تقرير الدورة الدورية',
    `🕒 ${new Date().toISOString().slice(11, 16)} UTC`,
    `🗂 مهام: pending=${queue.pending} active=${queue.active} done=${queue.done}`,
    `⚙️ Mission Loop نشط`
  ].join('\n');

  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.CHAT_ID || '888229115';
  const delivered = await sendMessageDetailed(report, chatId);
  try {
    db.prepare(`INSERT INTO operations_marketing(channel, message_id, product_id, status) VALUES ('aurora_report', ?, NULL, ?)`).run(delivered.messageId || 0, delivered.delivered ? 'sent' : 'failed');
  } catch { /* ignore */ }
  return { delivered: delivered.delivered, queue, report };
}

export default { addTask, addRecurringTask, nextTask, markDone, runHeartbeat, sendScheduledReport, missionLoop, seedDefaultQueue, getQueueStats, archiveDoneTasks, hasPending };
