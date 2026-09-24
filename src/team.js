import fs from 'node:fs/promises';
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

const MAX_AGENT_STEPS = 5;
const STEP_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function buildAgentPrompt(userMessage, ctx) {
  const toolsDesc = AVAILABLE_TOOLS.map(t => {
    const paramsList = Object.entries(t.params || {})
      .map(([k, v]) => `  - ${k}: ${v}`).join('\n');
    return `• ${t.name}: ${t.description}\n${paramsList}`;
  }).join('\n\n');

  return `أنتِ "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت".

بيانات النظام:
${JSON.stringify(ctx, null, 2)}

الأدوات المتاحة:
${toolsDesc}

قواعد صارمة:
- ردّك JSON فقط، بدون أي نص قبله أو بعده.
- الشكل:
{
  "action": "tool" | "final",
  "tool": "اسم الأداة",
  "params": { ... },
  "text": "ملخص قصير جداً (سطر أو اثنان)"
}

- عند action=final: النص يجب أن يكون **ملخصاً قصيراً فقط** (سطر أو اثنان).
- لا تكتب قوائم مفصلة — النظام يعرض النتائج الحقيقية تلقائياً.
- لا تختلقي أسماء ملفات أو معلومات.
- استخدمي action="tool" لجمع المعلومات، ثم action="final" لإنهاء المهمة.

أمر القائد: ${userMessage}

ردّك (JSON فقط):`;
}

function parseAgentResponse(raw) {
  const str = String(raw || '').trim();
  if (!str) return null;

  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* not pure JSON */ }

  const start = str.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(str.slice(start, i + 1));
          if (parsed && typeof parsed === 'object') return parsed;
        } catch { /* invalid */ }
        return null;
      }
    }
  }
  return null;
}

const FORBIDDEN_TERMS = ['الخصوم', 'الأعداء', 'الحدود', 'الحرب', 'المعارك', 'الجيش', 'العسكري', 'الجاسوس'];

function hasHallucination(text) {
  const lower = String(text).toLowerCase();
  return FORBIDDEN_TERMS.some(term => lower.includes(term.toLowerCase()));
}

function cleanText(text) {
  let clean = String(text || '').trim();
  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1');
  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();
  return clean;
}

// ═══════════════════════════════════════════════════════════
// 🎯 التنسيق المباشر لنتائج الأدوات (بدون LLM)
// ═══════════════════════════════════════════════════════════
function formatToolResult(toolName, toolResult, originalParams) {
  if (!toolResult || !toolResult.ok) {
    return `❌ فشل ${toolName}: ${toolResult?.error || 'unknown'}`;
  }

  const data = toolResult.result;

  if (toolName === 'grep_files') {
    if (!data || !data.results || data.results.length === 0) {
      return `🔍 لا توجد نتائج لـ "${originalParams?.pattern}"`;
    }
    const lines = [`🔍 <b>نتائج البحث عن "${originalParams?.pattern}"</b>`, `📊 عدد النتائج: ${data.results_count}`, ''];
    for (const r of data.results.slice(0, 20)) {
      lines.push(`📄 <code>${r.file}</code>:${r.line}`);
      lines.push(`    ${String(r.text).slice(0, 150)}`);
    }
    return lines.join('\n');
  }

  if (toolName === 'read_file') {
    if (!data || !data.content) return `📄 الملف فارغ`;
    return `📄 <b>محتوى ${originalParams?.file_path}:</b>\n<pre>${String(data.content).slice(0, 3000)}</pre>`;
  }

  if (toolName === 'read_many_files') {
    if (!data || !data.files) return `📄 لا ملفات`;
    const lines = [`📚 <b>قراءة ${data.count} ملف:</b>`, ''];
    for (const f of data.files) {
      if (f.error) {
        lines.push(`❌ <code>${f.file}</code>: ${f.error}`);
      } else {
        lines.push(`📄 <b>${f.file}</b> (${f.size} bytes):`);
        lines.push(`<pre>${String(f.content).slice(0, 800)}</pre>`);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  if (toolName === 'list_files') {
    if (!data || !data.items) return `📂 فارغ`;
    const lines = [`📂 <b>محتويات ${data.dir}</b> (${data.count} عنصر):`, ''];
    for (const item of data.items.slice(0, 100)) {
      lines.push(`${item.type === 'dir' ? '📁' : '📄'} <code>${item.path}</code>${item.size ? ' (' + item.size + 'B)' : ''}`);
    }
    return lines.join('\n');
  }

  if (toolName === 'web_search') {
    if (!data || !data.results || data.results.length === 0) {
      return `🌐 لا نتائج لـ "${originalParams?.query}"`;
    }
    const lines = [`🌐 <b>نتائج البحث عن "${originalParams?.query}"</b>`, ''];
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      lines.push(`${i + 1}. <b>${r.title}</b>`);
      if (r.snippet) lines.push(`   ${String(r.snippet).slice(0, 200)}`);
      if (r.url) lines.push(`   🔗 ${r.url}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  // أدوات أخرى → JSON مختصر
  return `✅ نتيجة ${toolName}:\n<pre>${JSON.stringify(data).slice(0, 2000)}</pre>`;
}

// ═══════════════════════════════════════════════════════════
// Agent Loop — يُرجع الإجابة النهائية مع البيانات الحقيقية
// ═══════════════════════════════════════════════════════════
async function runAgentLoop(userMessage, ctx) {
  let conversation = buildAgentPrompt(userMessage, ctx);
  let lastToolName = null;
  let lastToolResult = null;
  let lastToolParams = null;

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (step > 1) {
      console.log('[agent] waiting ' + STEP_DELAY_MS + 'ms before step ' + step);
      await sleep(STEP_DELAY_MS);
    }

    let raw;
    try {
      raw = await callModel('aurora', conversation, { noJsonMode: false });
    } catch (e) {
      console.error('[agent] step ' + step + ' LLM threw: ' + e.message);
      continue;
    }

    if (!raw || String(raw).trim().length < 5) {
      console.warn('[agent] step ' + step + ' empty raw');
      continue;
    }

    const parsed = parseAgentResponse(raw);

    if (!parsed || !parsed.action) {
      console.warn('[agent] step ' + step + ' no valid JSON. Raw: ' + String(raw).slice(0, 200));
      continue;
    }

    // طلب أداة
    if (parsed.action === 'tool' && parsed.tool) {
      console.log('[agent] step ' + step + ': tool=' + parsed.tool);
      let toolResult;
      try {
        toolResult = await executeTool(parsed.tool, parsed.params || {});
      } catch (e) {
        toolResult = { ok: false, error: e.message };
      }

      lastToolName = parsed.tool;
      lastToolResult = toolResult;
      lastToolParams = parsed.params || {};

      // إرسال النتيجة للـ LLM في المحادثة
      const resultText = JSON.stringify(toolResult).slice(0, 3000);
      const emoji = toolResult.ok ? '✅' : '❌';
      conversation += `\n\n${emoji} نتيجة ${parsed.tool}:\n${resultText}\n\nأعد JSON فقط.`;
      continue;
    }

    // إجابة نهائية
    if (parsed.action === 'final') {
      const summary = cleanText(parsed.text || '');

      // لو عندنا نتيجة أداة → نُنسّقها بأنفسنا
      if (lastToolName && lastToolResult) {
        const formattedData = formatToolResult(lastToolName, lastToolResult, lastToolParams);
        const parts = [];

        if (summary && summary.length > 5) {
          parts.push(summary);
          parts.push('');
        }

        parts.push(formattedData);

        const finalAnswer = parts.join('\n');
        console.log('[agent] final with tool data at step ' + step);
        return finalAnswer;
      }

      // لا أداة → نُعيد نص الـ LLM
      if (summary && summary.length > 5) {
        if (hasHallucination(summary)) {
          console.warn('[agent] final text hallucination');
          continue;
        }
        console.log('[agent] final text at step ' + step);
        return summary;
      }
    }
  }

  // لو وصلنا هنا، نُعيد آخر نتيجة أداة إن وُجدت
  if (lastToolName && lastToolResult) {
    return formatToolResult(lastToolName, lastToolResult, lastToolParams);
  }

  return null;
}

function buildFallback(ctx) {
  if (ctx.error) return 'تعذر قراءة بيانات النظام: ' + ctx.error;
  return 'حالة النظام: ' + ctx.health.healthy + ' من ' + ctx.health.total + ' مكونات سليمة.';
}

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
  console.log('[team] === direct-format mode ===');

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
