import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';

export const AGENTS = [
  { id: 'aurora', name: 'أورورا', color: '#a78bfa' },
  { id: 'planner', name: 'المخطط', color: '#60a5fa' },
  { id: 'executor', name: 'المنفذ', color: '#34d399' },
  { id: 'reviewer', name: 'المراجع', color: '#fbbf24' },
  { id: 'scout', name: 'المستخبر', color: '#f472b6' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

// ─────────────────────────────────────────────
// جمع بيانات حقيقية من قاعدة البيانات
// ─────────────────────────────────────────────
function collectSystemSnapshot() {
  try {
    const health = db.prepare(`
      SELECT component, healthy, detail FROM health_checks
      WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
    `).all();

    const tasksTotal = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const tasksDone = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done'").get().c;
    const tasksPending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('done','cancelled')").get().c;
    const pendingApprovals = db.prepare("SELECT COUNT(*) as c FROM approvals WHERE state='pending'").get().c;

    const recentErrors = db.prepare(`
      SELECT scope, error_type, COUNT(*) as count FROM errors
      WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours')
      GROUP BY scope, error_type
      LIMIT 5
    `).all();

    const agents = db.prepare(`
      SELECT COUNT(DISTINCT agent) as c FROM agent_runs
      WHERE created_at >= datetime('now', '-1 hour')
    `).get().c;

    return {
      health: {
        total: health.length,
        healthy: health.filter(h => h.healthy === 1).length,
        failing: health.filter(h => h.healthy !== 1).map(h => h.component)
      },
      tasks: { total: tasksTotal, done: tasksDone, pending: tasksPending },
      approvals: pendingApprovals,
      errors: recentErrors,
      activeAgents: agents
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────
// بناء تقرير قالب (بدون LLM — لا هلوسة ممكنة)
// ─────────────────────────────────────────────
function buildTemplateReport(userMessage, snapshot) {
  const time = new Date().toISOString().slice(0, 16).replace('T', ' ');

  if (snapshot.error) {
    return [
      `📋 تقرير حالة النظام`,
      ``,
      `⚠️ تعذر قراءة قاعدة البيانات: ${snapshot.error}`,
      ``,
      `⏰ ${time} UTC`
    ].join('\n');
  }

  const lines = [
    `📋 تقرير حالة النظام`,
    ``,
    `🩺 صحة النظام: ${snapshot.health.healthy}/${snapshot.health.total} مكونات سليمة`,
  ];

  if (snapshot.health.failing.length > 0) {
    lines.push(`   ⚠️ مكونات تحتاج مراجعة: ${snapshot.health.failing.join('، ')}`);
  } else if (snapshot.health.total > 0) {
    lines.push(`   ✅ جميع المكونات تعمل`);
  } else {
    lines.push(`   ℹ️ لم تُسجّل فحوصات صحية بعد`);
  }

  lines.push(``);
  lines.push(`📊 المهام:`);
  lines.push(`   • إجمالي: ${snapshot.tasks.total}`);
  lines.push(`   • منجزة: ${snapshot.tasks.done}`);
  lines.push(`   • معلقة: ${snapshot.tasks.pending}`);

  lines.push(``);
  lines.push(`📬 موافقات معلقة: ${snapshot.approvals}`);
  lines.push(`👥 وكلاء نشطون (آخر ساعة): ${snapshot.activeAgents}`);

  if (snapshot.errors.length > 0) {
    lines.push(``);
    lines.push(`⚠️ أخطاء آخر 24 ساعة (${snapshot.errors.length}):`);
    for (const err of snapshot.errors) {
      lines.push(`   • ${err.scope}/${err.error_type} (${err.count}x)`);
    }
  } else {
    lines.push(``);
    lines.push(`✅ لا أخطاء خلال 24 ساعة`);
  }

  lines.push(``);
  lines.push(`⏰ ${time} UTC`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────
// (اختياري) تحسين التقرير بـ LLM — إن فشل، نُبقي القالب
// ─────────────────────────────────────────────
async function tryEnhanceWithLLM(templateReport) {
  // معطّل افتراضياً — لا حاجة للـ LLM في التقارير الواقعية
  if (process.env.TEAM_LLM_ENHANCE !== 'true') return null;
  try {
    const prompt = `حسّن صياغة التقرير التالي بالعربية الفصحى، دون تغيير أي رقم أو حقيقة:

${templateReport}

اكتب النسخة المحسّنة فقط، بدون مقدمات.`;
    const result = await callModel('aurora', prompt, { noJsonMode: true });
    const clean = String(result || '').trim();
    return clean.length > 50 ? clean : null;
  } catch {
    return null;
  }
}

function sanitizeStoredBody(body) {
  const s = String(body || '');
  const looksLikeJson =
    s.startsWith('{') || s.startsWith('[') ||
    s.includes('"response"') || s.includes('"status"') ||
    s.includes('"components"') || s.includes('"telegram"') ||
    (s.match(/[{]/g) || []).length > 2;

  if (looksLikeJson) {
    let clean = s;
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === 'object' && parsed !== null) {
        clean = parsed.response || parsed.report || parsed.text || parsed.message || JSON.stringify(parsed);
      }
    } catch { /* not JSON */ }
    return String(clean).slice(0, 2000);
  }
  return s;
}

async function sendTelegramSafe(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed !== 'function') return { delivered: false };
    return await mod.sendMessageDetailed(text);
  } catch (err) {
    console.error('[team] send failed:', err?.message);
    return { delivered: false, error: err?.message };
  }
}

export function listMessages(limit = 100) {
  const rows = db.prepare(`
    SELECT id, thread, sender, recipient, body, attachment_name AS attachmentName,
           attachment_type AS attachmentType, attachment_size AS attachmentSize,
           attachment_path AS attachmentPath, created_at AS createdAt
    FROM messages ORDER BY id DESC LIMIT ?
  `).all(Math.min(Number(limit) || 100, 300)).reverse();

  return rows.map(r => ({ ...r, body: sanitizeStoredBody(r.body) }));
}

export async function createMessage(input) {
  let attachment = { name: '', type: '', size: 0, path: '' };
  if (input.attachment?.base64) attachment = await saveAttachment(input.attachment);
  const result = db.prepare(`
    INSERT INTO messages(thread,sender,recipient,body,attachment_name,attachment_type,attachment_size,attachment_path)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    input.thread || 'team', input.sender || 'leader', input.recipient || 'all',
    String(input.body || '').slice(0, 20000), attachment.name, attachment.type,
    attachment.size, attachment.path
  );
  const messageId = Number(result.lastInsertRowid);
  const message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  teamEvents.emit('message', { type: 'created', messageId });
  generateAgentReplies(message).catch(err => console.error('[team] generateAgentReplies failed:', err?.message));
  return message;
}

async function generateAgentReplies(message) {
  console.log('[team] template-report mode, message=' + String(message.body).slice(0, 50));

  // 1) جمع البيانات الحقيقية
  const snapshot = collectSystemSnapshot();
  console.log('[team] snapshot: health=' + snapshot.health?.healthy + '/' + snapshot.health?.total + ', tasks.pending=' + snapshot.tasks?.pending);

  // 2) بناء تقرير قالب (بدون LLM)
  let report = buildTemplateReport(message.body, snapshot);

  // 3) (اختياري) تحسين بـ LLM — معطّل افتراضياً
  const enhanced = await tryEnhanceWithLLM(report);
  if (enhanced) {
    report = enhanced;
    console.log('[team] LLM enhanced report');
  } else {
    console.log('[team] using template report (no LLM)');
  }

  // 4) حفظ
  insertAgentMessage('aurora', report);

  // 5) إرسال رسالة واحدة
  const finalText = [
    `📋 <b>تقرير النظام</b>`,
    ``,
    report
  ].join('\n');

  await sendTelegramSafe(finalText);
  await notify('team_message', `تقرير جديد`, message.body.slice(0, 500));
}

function insertAgentMessage(agent, body) {
  const result = db.prepare(`
    INSERT INTO messages(thread,sender,recipient,body) VALUES ('team',?,'leader',?)
  `).run(agent, String(body).slice(0, 20000));
  teamEvents.emit('message', { type: 'agent-reply', messageId: Number(result.lastInsertRowid), agent });
}

export async function attachmentFile(relativePath) {
  const requested = path.resolve(config.root, '.' + relativePath);
  const root = path.resolve(config.root, 'uploads');
  if (!requested.startsWith(root + path.sep)) return null;
  try { return await fs.readFile(requested); }
  catch { return null; }
}
