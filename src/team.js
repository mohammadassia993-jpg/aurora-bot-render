١import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';
import { executeTool, AVAILABLE_TOOLS } from './tool-executor.js';

export const AGENTS = [
  { id: 'aurora', name: 'أورورا', color: '#a78bfa' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

// ─────────────────────────────────────────────
// إعدادات Agent Loop (محسّنة لتفادي rate limit)
// ─────────────────────────────────────────────
const MAX_AGENT_STEPS = 4;
const STEP_DELAY_MS = 3000;  // 3 ثواني بين كل خطوة

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════
// جمع بيانات النظام
// ═══════════════════════════════════════════════════════════
function collectSystemSnapshot() {
  try {
    const health = db.prepare(`
      SELECT component, healthy, detail FROM health_checks
      WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
    `).all();
    const tasksByStatus = db.prepare(`SELECT status, COUNT(*) c FROM tasks GROUP BY status`).all();
    const recentErrors = db.prepare(`
      SELECT scope, error_type, last_seen FROM errors
      WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours')
      ORDER BY last_seen DESC LIMIT 5
    `).all();
    const pendingApprovals = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE state='pending'`).get().c;
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
      tasks: tasksByStatus,
      errors: recentErrors,
      approvals: pendingApprovals,
      products: products
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// System Prompt مع الأدوات
// ═══════════════════════════════════════════════════════════
function buildAuroraPrompt(userMessage, ctx) {
  const toolsDesc = AVAILABLE_TOOLS.map(t => {
    const paramsList = Object.entries(t.params || {})
      .map(([k, v]) => `      • ${k}: ${v}`).join('\n');
    return `• ${t.name}\n  ${t.description}\n  params:\n${paramsList}`;
  }).join('\n\n');

  return `أنتِ "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". تتحدثين مع قائدك محمد عباس.
أنتِ ذكية، صريحة، ودودة، وقادرة على استخدام الأدوات.

════════ بيانات النظام الآن ════════
${JSON.stringify(ctx, null, 2)}

════════ الأدوات المتاحة لك ════════
${toolsDesc}

════════ كيف تستخدمين الأدوات ════════
- عندما تحتاجين معلومة غير موجودة أعلاه، اطلبي الأداة هكذا:

  [TOOL_CALL] {"name":"web_search","params":{"query":"بيتكوين اليوم"}}

- سيتوقف ردّك تلقائياً، وستصلك نتيجة الأداة، ثم تستمرين.
- يمكنك طلب عدة أدوات بالتتابع (4 خطوات كحد أقصى).
- عندما تكونين جاهزة، اكتبي الجواب مباشرة بدون أي [TOOL_CALL].

════════ أمثلة ════════
- "اقرأ config.js" → [TOOL_CALL] {"name":"read_file","params":{"file_path":"src/config.js"}}
- "ابحث عن X" → [TOOL_CALL] {"name":"grep_files","params":{"pattern":"X","file_ext":".js"}}
- "اعرض الملفات" → [TOOL_CALL] {"name":"list_files","params":{"dir":"src","max_depth":2}}
- "آخر أخبار Web3؟" → [TOOL_CALL] {"name":"web_search","params":{"query":"آخر أخبار Web3"}}

════════ قواعد صارمة ════════
1. تحدثي كإنسان طبيعي.
2. لا تختلقي معلومات. استخدمي الأدوات عند الحاجة.
3. لا تتكلمي عن أشياء غير موجودة (لا خصوم، لا حروب).
4. العربية الفصحى، بدون مقدمات.
5. إن لم تحتاجي أداة، أجيبي مباشرة.

════════ أمر القائد ════════
${userMessage}

════════ ابدئي الآن:`;
}

// ═══════════════════════════════════════════════════════════
// استخراج نداء الأداة
// ═══════════════════════════════════════════════════════════
function extractToolCall(text) {
  const marker = '[TOOL_CALL]';
  const idx = String(text).indexOf(marker);
  if (idx === -1) return null;

  const after = String(text).slice(idx + marker.length).trim();
  const braceStart = after.indexOf('{');
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < after.length; i++) {
    if (after[i] === '{') depth++;
    else if (after[i] === '}') {
      depth--;
      if (depth === 0) {
        const json = after.slice(braceStart, i + 1);
        try {
          const parsed = JSON.parse(json);
          if (parsed && parsed.name) return parsed;
        } catch { /* invalid */ }
        return null;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// فلتر الهلوسة
// ═══════════════════════════════════════════════════════════
const FORBIDDEN_TERMS = ['الخصوم', 'الأعداء', 'الحدود', 'الحرب', 'المعارك', 'الجيش', 'العسكري', 'الجاسوس'];

function hasHallucination(text) {
  const lower = String(text).toLowerCase();
  return FORBIDDEN_TERMS.some(term => lower.includes(term.toLowerCase()));
}

function cleanAgentResponse(text) {
  let clean = String(text || '').trim();
  clean = clean.replace(/\[TOOL_CALL\][\s\S]*$/g, '').trim();

  try {
    if (clean.startsWith('{') || clean.startsWith('[')) {
      const parsed = JSON.parse(clean);
      if (typeof parsed === 'object' && parsed !== null) {
        clean = parsed.response || parsed.report || parsed.text || parsed.message || JSON.stringify(parsed);
      }
    }
  } catch { /* not JSON */ }

  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1');

  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();
  if (clean.length > 3500) clean = clean.slice(0, 3500) + '…';
  return clean || null;
}

// ═══════════════════════════════════════════════════════════
// حلقة الوكيل (محسّنة)
// ═══════════════════════════════════════════════════════════
async function runAgentLoop(userMessage, ctx) {
  let conversation = buildAuroraPrompt(userMessage, ctx);

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    // انتظار بين الخطوات (بعد الأول)
    if (step > 1) {
      console.log('[agent] waiting ' + STEP_DELAY_MS + 'ms before step ' + step);
      await sleep(STEP_DELAY_MS);
    }

    let raw;
    try {
      raw = await callModel('aurora', conversation, { noJsonMode: true });
    } catch (e) {
      console.error('[agent] step ' + step + ' LLM failed: ' + e.message);
      return null;
    }

    if (!raw || raw.length < 10) {
      console.warn('[agent] step ' + step + ' empty response');
      continue;
    }

    const toolCall = extractToolCall(raw);

    if (toolCall && step < MAX_AGENT_STEPS) {
      console.log('[agent] step ' + step + ': tool=' + toolCall.name);
      let toolResult;
      try {
        toolResult = await executeTool(toolCall.name, toolCall.params || {});
      } catch (e) {
        toolResult = { ok: false, error: e.message };
      }

      const resultText = JSON.stringify(toolResult).slice(0, 2500);
      const toolEmoji = toolResult.ok ? '✅' : '❌';

      conversation += `\n\n${toolEmoji} [نتيجة ${toolCall.name}]:\n${resultText}\n\nبناءً على هذه النتيجة، استمري. إذا انتهيتِ، اكتبي الجواب النهائي مباشرة بدون أي [TOOL_CALL].`;
      continue;
    }

    const cleaned = cleanAgentResponse(raw);
    if (!cleaned || cleaned.length < 5) {
      console.warn('[agent] step ' + step + ' empty clean');
      continue;
    }

    if (hasHallucination(cleaned)) {
      console.warn('[agent] step ' + step + ' hallucination');
      continue;
    }

    console.log('[agent] final answer at step ' + step);
    return cleaned;
  }

  return null;
}

function buildFallback(ctx) {
  if (ctx.error) return 'تعذر قراءة بيانات النظام: ' + ctx.error;
  return 'حالة النظام: ' + ctx.health.healthy + ' من ' + ctx.health.total + ' مكونات سليمة.';
}

// ═══════════════════════════════════════════════════════════
// Helpers
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
  generateAgentReplies(message).catch(err => console.error('[team] generateAgentReplies failed: ' + err?.message));
  return message;
}

async function generateAgentReplies(message) {
  console.log('[team] === agent mode ===');

  const ctx = collectSystemSnapshot();

  let reply = await runAgentLoop(message.body, ctx);
  if (!reply) reply = buildFallback(ctx);

  insertAgentMessage('aurora', reply);
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
