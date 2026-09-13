/**
 * task-queue.js — Persistent Task Queue + Mission Loop
 *
 * Keeps the team working 24/7 via:
 * - SQLite-backed task queue (survives restarts)
 * - /heartbeat external endpoint: pulls next task, executes, records result
 * - /send-report endpoint: sends scheduled Aurora report
 * - Mission Loop: always generates the next task when queue empties
 */
import { db } from './db.js';
import { info, warn } from './logger.js';
import { sendMessageDetailed } from './telegram.js';
import { audit } from './audit.js';

// ── Schema: typed task queue (one-time / recurring / on-demand) + archive ──
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
  try {
    db.exec(`ALTER TABLE task_queue ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (!String(error).includes('duplicate column name')) throw error;
  }
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
    db.prepare(`
      UPDATE task_queue SET status='active', last_run_at=?, next_run_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(nowIso, nextRunAt, task.id);
  }
  return task || null;
}

export function markDone(id, result = 'done') {
  const task = db.prepare('SELECT * FROM task_queue WHERE id = ?').get(id);
  if (task?.type === 'recurring') {
    // recurring tasks requeue themselves on next_run_at
    db.prepare(`
      UPDATE task_queue SET status='pending', result=?, last_run_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(String(result).slice(0, 1000), id);
    audit('executor', 'task_queue_recurring', { taskId: id, result: String(result).slice(0, 100) });
    info('task-queue', `recurring #${id} requeued: ${String(result).slice(0, 50)}`);
  } else {
    db.prepare(`
      UPDATE task_queue SET status='done', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(String(result).slice(0, 1000), id);
    audit('executor', 'task_queue_done', { taskId: id, result: String(result).slice(0, 100) });
    info('task-queue', `done #${id}: ${String(result).slice(0, 50)}`);
  }
  return { ok: true, taskId: id };
}

export function archiveDoneTasks(olderThanDays = 3) {
  const res = db.prepare(`
    UPDATE task_queue SET archived = 1, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'done' AND archived = 0 AND created_at < datetime('now', ?)
  `).run(`-${olderThanDays} days`);
  if (res.changes > 0) info('task-queue', `archived ${res.changes} old done tasks`);
  return res.changes;
}

export function getQueueStats() {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM task_queue WHERE archived = 0 GROUP BY status").all();
  const stats = Object.fromEntries(rows.map(r => [r.status, r.c]));
  const byType = db.prepare(`
    SELECT type, COUNT(*) c FROM task_queue WHERE status != 'done' AND archived = 0 GROUP BY type
  `).all();
  const types = Object.fromEntries(byType.map(r => [r.type, r.c]));
  return {
    pending: stats.pending || 0,
    active: stats.active || 0,
    done: stats.done || 0,
    total: rows.reduce((s, r) => s + r.c, 0),
    types
  };
}

// ── Seed default continuous mission tasks (no marketing — handled by missionLoop) ──
export function seedDefaultQueue() {
  const count = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;
  if (count > 0) return { seeded: 0, pending: count };

  const defaults = [
    ['فحص البريد الوارد والرد على أي رسائل جديدة', 'email', 8],
    ['فحص فرص العمل والعقود الجديدة عبر منصة Dework/RemoteOK', 'opportunities', 8],
    ['التحقق من صحة متجر المنتجات وجدول الأسعار', 'store', 5],
    ['تدقيق صحة النظام (DB integrity + logs)', 'maintenance', 4]
  ];
  for (const [desc, cat, pri] of defaults) {
    if (!hasPending(cat)) addTask(desc, cat, pri);
  }
  info('task-queue', `seeded ${defaults.length} default tasks`);
  return { seeded: defaults.length };
}

// ── Mission Loop: always generate the next task (deduplicated per category) ──
export function missionLoop() {
  const created = [];
  const pending = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;

  // Guard: only refill when pending is low
  if (pending >= 5) return { created, pending };

  // 1. Follow-up: store orders awaiting payment older than 24h
  const staleOrders = db.prepare(`
    SELECT COUNT(*) c FROM store_orders
    WHERE status = 'awaiting_payment' AND date(created_at) < date('now')
  `).get().c;
  if (staleOrders > 0 && !hasPending('sales')) {
    created.push(addTask('إرسال تذكير متابعة للطلبات المعلقة بالدفع', 'sales', 9));
  }

  // 2. Marketing: max one channel post/day, only when approved products exist
  const postsToday = db.prepare(`
    SELECT COUNT(*) c FROM operations_marketing
    WHERE channel='telegram_channel' AND date(created_at) = date('now')
  `).get().c ?? 0;
  const approvedProducts = db.prepare(`
    SELECT COUNT(*) c FROM produced_products
    WHERE status='approved' AND content_md IS NOT NULL AND length(content_md) >= 1000
  `).get().c ?? 0;
  if (postsToday < 1 && approvedProducts > 0 && !hasPending('marketing')) {
    created.push(addTask('نشر منشور تسويقي واحد لقناة المتجر (منتج معتمد)', 'marketing', 6));
  }

  // 3. Opportunities: scan sources
  if (!hasPending('opportunities')) {
    created.push(addTask('فحص مصادر الفرص (RemoteOK/Dework) وترشيح الجديد', 'opportunities', 8));
  }

  // 4. Email: check for unread replies
  if (!hasPending('email')) {
    created.push(addTask('التحقق من البريد الوارد (IMAP) للردود الجديدة', 'email', 7));
  }

  archiveDoneTasks(3);
  return { created, pending: db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status='pending'").get().c };
}

// ── Execute one task (used by /heartbeat AND by mission loop) ──
export async function executeTask(task) {
  const cat = task.category;
  try {
    if (cat === 'email') {
      const { checkEmail } = await import('./watchdog.js');
      if (typeof checkEmail === 'function') await checkEmail();
      return 'email checked';
    }
    if (cat === 'opportunities') {
      const { scanRealOpportunities } = await import('./opportunity-scan.js');
      if (typeof scanRealOpportunities === 'function') await scanRealOpportunities();
      return 'opportunities scanned';
    }
    if (cat === 'marketing') {
      const { runMarketingPublish } = await import('./operations.js');
      if (typeof runMarketingPublish === 'function') await runMarketingPublish();
      return 'marketing post published';
    }
    if (cat === 'sales') {
      const { runFollowups } = await import('./operations.js');
      if (typeof runFollowups === 'function') await runFollowups();
      return 'sales followups sent';
    }
    if (cat === 'maintenance') {
      const integrity = db.prepare('PRAGMA integrity_check').get();
      return `integrity=${integrity?.integrity_check || 'ok'}`;
    }
    if (cat === 'store') {
      const { productCatalogue } = await import('./storefront.js');
      return `store ok: ${String(productCatalogue()).length} chars`;
    }
    // general: simple AI-assisted action marker
    return 'task executed (general)';
  } catch (e) {
    warn('task-queue', `execute failed #${task.id}: ${e.message}`);
    return `FAILED: ${e.message}`;
  }
}

// ── Heartbeat: pick next task, run it, refill queue ──
export async function runHeartbeat() {
  let task = nextTask();
  if (!task) {
    seedDefaultQueue();
    task = nextTask();
  }
  let result = 'no task';
  if (task) {
    result = await executeTask(task);
    markDone(task.id, result);
  }
  const refill = missionLoop();
  return {
    ok: true,
    executed: task ? task.id : null,
    description: task ? task.description : null,
    result,
    queue: getQueueStats(),
    refill: refill.created.length
  };
}

// ── Real-numbers report for Aurora ──
export async function sendScheduledReport() {
  // Periodic window guard: one official report per ~3h (avoid duplicates from cron + internal loop)
  const recentReport = db.prepare(`
    SELECT COUNT(*) c FROM operations_marketing
    WHERE channel='aurora_report' AND created_at >= datetime('now', '-170 minutes')
  `).get().c ?? 0;
  if (recentReport > 0) {
    info('report', `scheduled report skipped: already sent within window (${recentReport} recent)`);
    return { delivered: false, skipped: 'window_guard', queue: getQueueStats() };
  }

  const emailsSent = db.prepare("SELECT COUNT(*) c FROM outbox WHERE subject LIKE 'MAIL:%'").get().c ?? 0;
  const channelPosts = db.prepare(`SELECT COUNT(*) c FROM operations_marketing WHERE channel='telegram_channel'`).get().c ?? 0;
  const productsPublished = db.prepare("SELECT COUNT(*) c FROM produced_products WHERE status='published'").get().c ?? 0;
  const productsPending = db.prepare("SELECT COUNT(*) c FROM produced_products WHERE status='pending_approval'").get().c ?? 0;
  const productsRejected = db.prepare("SELECT COUNT(*) c FROM produced_products WHERE status='rejected'").get().c ?? 0;
  const orders = db.prepare("SELECT COUNT(*) c FROM store_orders").get().c ?? 0;
  const paid = db.prepare("SELECT COUNT(*) c FROM store_orders WHERE status='paid' OR status='delivered'").get().c ?? 0;
  const queue = getQueueStats();

  const report = [
    '📊 تقرير الدورة الدورية (كل 3 ساعات)',
    `🕒 ${new Date().toISOString().slice(11, 16)} UTC | ${new Date().toISOString().slice(0, 10)}`,
    '━━━━━━━━━━━━━━━',
    `📬 بريد مُرسل: ${emailsSent}`,
    `📣 منشورات القناة: ${channelPosts}`,
    `📦 منتجات منشورة: ${productsPublished} (بانتظار موافقة: ${productsPending}, مرفوضة آلياً: ${productsRejected})`,
    `🛒 طلبات: ${orders} (مدفوعة: ${paid})`,
    `🗂 قائمة المهام: pending=${queue.pending} active=${queue.active} done=${queue.done} (types: ${JSON.stringify(queue.types || {})})`,
    '',
    '⚙️ Mission Loop نشط — المهام تُنشأ دون تكرار (dedup لكل فئة)'
  ].join('\n');

  const delivered = await sendMessageDetailed(report);
  db.prepare(`
    INSERT INTO operations_marketing(channel, message_id, product_id, status)
    VALUES ('aurora_report', ?, 'scheduled', ?)
  `).run(delivered.messageId || 0, delivered.delivered ? 'sent' : 'failed');
  return { delivered: delivered.delivered, queue, report };
}

export default { addTask, addRecurringTask, nextTask, markDone, runHeartbeat, sendScheduledReport, missionLoop, seedDefaultQueue, getQueueStats, archiveDoneTasks, hasPending };
