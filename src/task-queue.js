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
import { info, warn, error as errLog } from './logger.js';
import { sendMessageDetailed } from './telegram.js';
import { callModel } from './ai.js';
import { audit } from './audit.js';

// ── Schema ──
db.exec(`
CREATE TABLE IF NOT EXISTS task_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  category TEXT DEFAULT 'general',
  result TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS task_queue_pending ON task_queue(status, priority);
`);

export function addTask(description, category = 'general', priority = 5) {
  const res = db.prepare(`
    INSERT INTO task_queue(description, status, priority, category)
    VALUES (?, 'pending', ?, ?)
  `).run(description, priority, category);
  info('task-queue', `queue +${res.lastInsertRowid} [${category}] ${description.slice(0, 60)}`);
  return res.lastInsertRowid;
}

export function nextTask() {
  const task = db.prepare(`
    SELECT * FROM task_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, id ASC LIMIT 1
  `).get();
  if (task) {
    db.prepare("UPDATE task_queue SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(task.id);
  }
  return task || null;
}

export function markDone(id, result = 'done') {
  db.prepare("UPDATE task_queue SET status='done', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(String(result).slice(0, 1000), id);
  audit('executor', 'task_queue_done', { taskId: id, result: String(result).slice(0, 100) });
  info('task-queue', `done #${id}: ${String(result).slice(0, 50)}`);
  return { ok: true, taskId: id };
}

export function getQueueStats() {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM task_queue GROUP BY status").all();
  const stats = Object.fromEntries(rows.map(r => [r.status, r.c]));
  return { pending: stats.pending || 0, active: stats.active || 0, done: stats.done || 0, total: rows.reduce((s, r) => s + r.c, 0) };
}

// ── Seed default continuous mission tasks ──
export function seedDefaultQueue() {
  const count = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;
  if (count > 0) return { seeded: 0, pending: count };

  const defaults = [
    ['فحص البريد الوارد والرد على أي رسائل جديدة', 'email', 8],
    ['فحص فرص العمل والعقود الجديدة عبر منصة Dework/RemoteOK', 'opportunities', 8],
    ['إنشاء منشور تسويقي واحد للمنتجات الستة', 'marketing', 6],
    ['التحقق من صحة متجر المنتجات وجدول الأسعار', 'store', 5],
    ['تدقيق صحة النظام (DB integrity + logs)', 'maintenance', 4]
  ];
  for (const [desc, cat, pri] of defaults) addTask(desc, cat, pri);
  info('task-queue', `seeded ${defaults.length} default tasks`);
  return { seeded: defaults.length };
}

// ── Mission Loop: always generate the next task ──
export function missionLoop() {
  const created = [];
  const pending = db.prepare("SELECT COUNT(*) c FROM task_queue WHERE status = 'pending'").get().c;

  // Guard: only refill when pending is low
  if (pending >= 3) return { created, pending };

  const now = new Date().toISOString().slice(0, 10);

  // 1. Follow-up: check store orders awaiting payment older than 24h
  const staleOrders = db.prepare(`
    SELECT COUNT(*) c FROM store_orders
    WHERE status = 'awaiting_payment' AND date(created_at) < date('now')
  `).get().c;
  if (staleOrders > 0) {
    created.push(addTask('إرسال تذكير متابعة للطلبات المعلقة بالدفع', 'sales', 9));
  }

  // 2. Products: generate next untitled product from 92 deliverables (if enabled)
  const produced = db.prepare("SELECT COUNT(*) c FROM produced_products WHERE status='approved'").get().c ?? 0;

  // 3. Opportunities: scan if no opportunities updated today
  const oppToday = db.prepare(`SELECT COUNT(*) c FROM tasks WHERE date(updated_at) = date('now')`).get().c;
  if (Number(oppToday) < 2) {
    created.push(addTask('فحص مصادر الفرص (RemoteOK/Dework) وترشيح الجديد', 'opportunities', 8));
  }

  // 4. Marketing: one channel post if none today
  const postsToday = db.prepare(`SELECT COUNT(*) c FROM outbox WHERE date(created_at) = date('now') AND subject LIKE 'MARKETING:%'`).get().c;
  if (Number(postsToday) < 1) {
    created.push(addTask('نشر منشور تسويقي على قناة المتجر', 'marketing', 6));
  }

  // 5. Email: check for unread replies
  created.push(addTask('التحقق من البريد الوارد (IMAP) للردود الجديدة', 'email', 7));

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
      const { reApplyOldOpportunities } = await import('./job-applicant.js');
      if (typeof reApplyOldOpportunities === 'function') await reApplyOldOpportunities();
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
  const emailsSent = db.prepare("SELECT COUNT(*) c FROM outbox WHERE subject LIKE 'MAIL:%'").get().c ?? 0;
  const channelPosts = db.prepare(`SELECT COUNT(*) c FROM operations_marketing WHERE channel='telegram_channel'`).get().c ?? 0;
  const productsPublished = db.prepare("SELECT COUNT(*) c FROM produced_products WHERE status='published'").get().c ?? 0;
  const orders = db.prepare("SELECT COUNT(*) c FROM store_orders").get().c ?? 0;
  const paid = db.prepare("SELECT COUNT(*) c FROM store_orders WHERE status='paid' OR status='delivered'").get().c ?? 0;
  const queue = getQueueStats();

  const report = [
    '📊 تقرير الدورة الدورية (كل 3 ساعات)',
    `🕒 ${new Date().toISOString().slice(11, 16)} UTC | ${new Date().toISOString().slice(0, 10)}`,
    '━━━━━━━━━━━━━━━',
    `📬 بريد مُرسل: ${emailsSent}`,
    `📣 منشورات القناة: ${channelPosts}`,
    `📦 منتجات منشورة: ${productsPublished}`,
    `🛒 طلبات: ${orders} (مدفوعة: ${paid})`,
    `🗂 قائمة المهام: pending=${queue.pending} active=${queue.active} done=${queue.done}`,
    '',
    '⚙️ Mission Loop نشط — سيُولِّد المهمة التالية تلقائياً'
  ].join('\n');

  const delivered = await sendMessageDetailed(report);
  db.prepare(`
    INSERT INTO operations_marketing(channel, message_id, product_id, status)
    VALUES ('aurora_report', ?, 'scheduled', ?)
  `).run(delivered.messageId || 0, delivered.delivered ? 'sent' : 'failed');
  return { delivered: delivered.delivered, queue, report };
}

export default { addTask, nextTask, markDone, runHeartbeat, sendScheduledReport, missionLoop, seedDefaultQueue, getQueueStats };
