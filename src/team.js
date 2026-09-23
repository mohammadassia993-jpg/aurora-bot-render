import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';

export const AGENTS = [
  { id: 'aurora', name: 'أورورا', color: '#a78bfa' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

// ═══════════════════════════════════════════════════════════
// 1) جمع بيانات حقيقية وشاملة
// ═══════════════════════════════════════════════════════════
function collectFullContext() {
  try {
    const health = db.prepare(`
      SELECT component, healthy, detail FROM health_checks
      WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
    `).all();

    const tasksByStatus = db.prepare(`SELECT status, COUNT(*) c FROM tasks GROUP BY status`).all();
    const tasksRecent = db.prepare(`
      SELECT title, status, source, created_at FROM tasks
      ORDER BY id DESC LIMIT 5
    `).all();

    const recentErrors = db.prepare(`
      SELECT scope, error_type, message, last_seen FROM errors
      WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours')
      ORDER BY last_seen DESC LIMIT 5
    `).all();

    const recentMessages = db.prepare(`
      SELECT sender, body, created_at FROM messages
      WHERE thread='team' AND sender != 'aurora'
      ORDER BY id DESC LIMIT 3
    `).all();

    const pendingApprovals = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE state='pending'`).get().c;
    const activeAgents = db.prepare(`
      SELECT agent, COUNT(*) c FROM agent_runs
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY agent ORDER BY c DESC LIMIT 5
    `).all();

    const products = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published
      FROM produced_products
    `).get();

    return {
      time: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      health: {
        total: health.length,
        healthy: health.filter(h => h.healthy === 1).length,
        failing: health.filter(h => h.healthy !== 1).map(h => ({ name: h.component, reason: h.detail || '' }))
      },
      tasks: {
        byStatus: tasksByStatus,
        recent: tasksRecent
      },
      errors: recentErrors,
      approvals: pendingApprovals,
      agents: activeAgents,
      products: products,
      previousMessages: recentMessages.map(m => `[${m.sender}]: ${String(m.body).slice(0, 150)}`)
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// 2) System Prompt قوي — يعلّم الـ LLM كيف يتحدث
// ═══════════════════════════════════════════════════════════
function buildAuroraPrompt(userMessage, ctx) {
  return `أنت "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". أنتِ ذكية، صريحة، ودودة. تتحدثين مع قائدك محمد عباس.

════════ بيانات النظام الحقيقية (استخدميها فقط) ════════

${JSON.stringify(ctx, null, 2)}

════════ قواعد صارمة (لا تكسريها) ════════

1. تحدثي كإنسان حقيقي، بأسلوب طبيعي ودافئ.
2. استخدمي فقط الأرقام والحقائق الموجودة في البيانات أعلاه.
3. لا تختلقي أي معلومة غير موجودة. إذا لم تجدي المعلومة، قولي: "لا توجد بيانات لدي عن هذا".
4. لا تتحدثي عن أشياء غير موجودة في البيانات (لا "خصوم"، لا "حدود"، لا "أعداء").
5. اكتبي بالعربية الفصحى الواضحة، بدون مقدمات مثل "بالتأكيد" أو "حسناً".
6. إذا سألك القائد عن "حالة النظام":
   - اذكري عدد المكونات السليمة من الإجمالي
   - اذكري المكونات التي بها مشاكل (إن وُجدت)
   - اذكري عدد المهام المعلقة والمنجزة
   - اذكري الأخطاء الأخيرة إن وُجدت
7. إذا سألك عن شيء آخر (نص، ترجمة، تحليل)، أجيبي بذكاء وطبيعية.
8. الطول: حسب السؤال — قصير للأسئلة القصيرة، مفصل للطلبات المعقدة.

════════ أمر القائد ════════

${userMessage}

════════ الآن اكتبي ردّك (بدون أي JSON، بدون أقواس، فقط نص عربي طبيعي):`;
}

// ═══════════════════════════════════════════════════════════
// 3) فلتر الهلوسة — يرفض الردود الغريبة
// ═══════════════════════════════════════════════════════════
const FORBIDDEN_TERMS = [
  'الخصوم', 'الأعداء', 'العدو', 'الحدود', 'الحرب', 'المعارك', 'الجيش',
  'العسكري', 'التسريبات', 'الاستخبارات العسكرية', 'الجاسوس',
  'military', 'enemy', 'troops', 'warfare'
];

function hasHallucination(text) {
  const lower = String(text).toLowerCase();
  return FORBIDDEN_TERMS.some(term => lower.includes(term.toLowerCase()));
}

function cleanAgentResponse(text) {
  let clean = String(text || '').trim();

  // إزالة JSON إن وُجد
  try {
    if (clean.startsWith('{') || clean.startsWith('[')) {
      const parsed = JSON.parse(clean);
      if (typeof parsed === 'object' && parsed !== null) {
        clean = parsed.response || parsed.report || parsed.text || parsed.message || JSON.stringify(parsed);
      }
    }
  } catch { /* not JSON */ }

  // إزالة علامات markdown
  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1')
               .replace(/^\s*\{[\s\S]*\}\s*$/gm, '');

  // تنظيف
  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();

  if (clean.length > 3500) clean = clean.slice(0, 3500) + '…';

  return clean || null;
}

// ═══════════════════════════════════════════════════════════
// 4) الرد مع آلية retry إذا هلوس
// ═══════════════════════════════════════════════════════════
async function generateSmartReply(userMessage, ctx) {
  const prompt = buildAuroraPrompt(userMessage, ctx);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callModel('aurora', prompt, { noJsonMode: true });
      const clean = cleanAgentResponse(raw);

      if (!clean || clean.length < 10) {
        console.warn('[team] empty response, attempt', attempt);
        continue;
      }

      if (hasHallucination(clean)) {
        console.warn('[team] hallucination detected, attempt', attempt, '→ retrying');
        continue;
      }

      console.log('[team] smart reply ok, length=' + clean.length);
      return clean;
    } catch (e) {
      console.error('[team] attempt', attempt, 'failed:', e?.message);
    }
  }

  // Fallback حقيقي مبني على البيانات
  return buildDataFallback(userMessage, ctx);
}

function buildDataFallback(userMessage, ctx) {
  if (ctx.error) {
    return `تعذر قراءة بيانات النظام: ${ctx.error}`;
  }
  return [
    `حالة النظام الآن:`,
    `• المكونات السليمة: ${ctx.health.healthy} من ${ctx.health.total}`,
    `• المهام المعلقة: ${ctx.tasks.byStatus.find(t => t.status === 'pending')?.c || 0}`,
    `• الأخطاء الأخيرة: ${ctx.errors.length}`,
    ``,
    `(تعذر توليد تحليل مفصل — حاول مرة أخرى)`
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// 5) Helpers
// ═══════════════════════════════════════════════════════════
function sanitizeStoredBody(body) {
  const s = String(body || '');
  const looksLikeJson = s.startsWith('{') || s.startsWith('[') || (s.match(/[{]/g) || []).length > 2;
  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === 'object' && parsed !== null) {
        return String(parsed.response || parsed.report || parsed.text || '').slice(0, 2000) || 'رد قديم';
      }
    } catch { /* not JSON */ }
    return 'رد قديم';
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
  console.log('[team] smart mode, message=' + String(message.body).slice(0, 50));

  // جمع البيانات
  const ctx = collectFullContext();
  console.log('[team] ctx: health=' + ctx.health?.healthy + '/' + ctx.health?.total);

  // توليد رد ذكي
  const reply = await generateSmartReply(message.body, ctx);

  insertAgentMessage('aurora', reply);

  // إرسال على Telegram
  await sendTelegramSafe(`💬 <b>أورورا</b>\n\n${reply}`);
  await notify('team_message', `رد أورورا`, message.body.slice(0, 500));
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
