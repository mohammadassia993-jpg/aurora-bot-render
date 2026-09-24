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

const MAX_AGENT_STEPS = 12;
const STEP_DELAY_MS = 1000;
const TELEGRAM_MAX_LEN = 3800;

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

  return `أنتِ "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". صلاحياتك كاملة.

بيانات النظام:
${JSON.stringify(ctx, null, 2)}

الأدوات المتاحة (15):
${toolsDesc}

═══ قواعد صارمة ═══

1. ردّك JSON فقط، بدون أي نص قبله أو بعده.
2. الشكل:
{
  "action": "tool" | "final",
  "tool": "اسم الأداة",
  "params": { ... },
  "text": "الإجابة النهائية"
}

3. عند action=final، النص يجب أن يكون **تحليلاً عميقاً حقيقياً** — ليس مجرد سطر أو اثنين.

4. ⚠️ مهم جداً — قواعد التحليل العميق:
   - اذكري **أسماء محددة** (متغيرات، دوال، ملفات) لا وصفاً عاماً.
   - للملفات: اذكري **الأقسام الفعلية** و **عدد الأسطر** و **العناصر الرئيسية**.
   - للمقارنة: اذكري **الفرق الجوهري** بالأمثلة (لا "مختلفان" بل "config يحتوي X بينما ai يحتوي Y").
   - للتحسين: اقترحي **اقتراحات محددة قابلة للتنفيذ** (لا "فصل الوظائف" بل "انقلي الدالة X من ملف A إلى B لأن...").
   - **بعد** الأداة الأولى، إذا احتجت معلومات إضافية، استدعي أداة أخرى قبل الإجابة.

5. ممنوع:
   - "يمكن تحسينه من خلال..." بدون تفاصيل.
   - وصف عام ("يحتوي على إعدادات").
   - إجابة سطر واحد للأوامر المعقدة.

6. يمكنك استخدام 12 خطوة — لا تتوقفي مبكراً.
7. عند الخطأ، جرّبي حلاً بديلاً (لا تستسلمي).
8. بعد كل أداة، فكّري: هل أحتاج معلومة إضافية؟

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
// تنسيق نتائج الأدوات (مع مراعاة حد Telegram)
// ═══════════════════════════════════════════════════════════
function formatToolResult(toolName, toolResult, originalParams) {
  if (!toolResult || !toolResult.ok) {
    return `❌ فشل ${toolName}: ${String(toolResult?.error || 'unknown').slice(0, 200)}`;
  }
  const data = toolResult.result;

  if (toolName === 'grep_files') {
    if (!data || !data.results || data.results.length === 0) return `🔍 لا نتائج لـ "${originalParams?.pattern}"`;
    const lines = [`🔍 "${originalParams?.pattern}" (${data.results_count} نتيجة):`, ''];
    for (const r of data.results.slice(0, 15)) {
      lines.push(`📄 ${r.file}:${r.line}`);
      lines.push(`   ${String(r.text).slice(0, 120)}`);
    }
    return lines.join('\n');
  }

  if (toolName === 'read_file') {
    if (!data || !data.content) return `📄 الملف فارغ`;
    return `📄 ${data.path || originalParams?.file_path} (${data.content.length}B):\n\`\`\`\n${String(data.content).slice(0, 1500)}\n\`\`\``;
  }

  if (toolName === 'read_many_files') {
    if (!data || !data.files) return `📄 لا ملفات`;
    const lines = [`📚 قراءة ${data.count} ملف:`, ''];
    for (const f of data.files) {
      if (f.error) lines.push(`❌ ${f.file}: ${f.error}`);
      else {
        lines.push(`📄 ${f.file} (${f.size}B):`);
        lines.push(`\`\`\`\n${String(f.content).slice(0, 800)}\n\`\`\``);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  if (toolName === 'list_files') {
    if (!data || !data.items) return `📂 فارغ`;
    const lines = [`📂 ${data.dir} (${data.count} عنصر):`, ''];
    for (const item of data.items.slice(0, 50)) {
      lines.push(`${item.type === 'dir' ? '📁' : '📄'} ${item.path}${item.size ? ' (' + item.size + 'B)' : ''}`);
    }
    return lines.join('\n');
  }

  if (toolName === 'web_search') {
    if (!data || !data.results || data.results.length === 0) return `🌐 لا نتائج لـ "${originalParams?.query}"`;
    const lines = [`🌐 "${originalParams?.query}":`, ''];
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      lines.push(`${i + 1}. ${r.title}`);
      if (r.snippet) lines.push(`   ${String(r.snippet).slice(0, 150)}`);
      if (r.url) lines.push(`   🔗 ${r.url}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  if (toolName === 'render_env_get') {
    if (!data || !data.vars) return `🔧 لا متغيرات`;
    const lines = [`🔧 متغيرات Render (${data.count}):`, ''];
    for (const v of data.vars.slice(0, 30)) lines.push(`• ${v.key}`);
    return lines.join('\n');
  }

  if (toolName === 'render_env_set') {
    return `✅ تم تحديث ${data.key} في Render.\nℹ️ ${data.note}`;
  }

  if (toolName === 'save_session') {
    return `💾 جلسة محفوظة: ${data.name}`;
  }

  if (toolName === 'load_session') {
    if (!data || !data.loaded) return `❌ جلسة غير موجودة`;
    return `📂 جلسة: ${data.name} (${data.savedAt})`;
  }

  if (toolName === 'platform_fetch') {
    const preview = typeof data.data === 'string' ? data.data.slice(0, 600) : JSON.stringify(data.data).slice(0, 600);
    const lines = [`🌐 ${data.status}`, ''];
    if (data.setCookie) lines.push(`🍪 Set-Cookie: ${data.setCookie.slice(0, 150)}`);
    lines.push(`\`\`\`\n${preview}\n\`\`\``);
    return lines.join('\n');
  }

  if (toolName === 'send_telegram') {
    return `✅ رسالة مرسلة (id=${data.message_id})`;
  }

  if (toolName === 'write_file') {
    return `💾 ملف مكتوب: ${data.path} (${data.bytes}B)`;
  }

  if (toolName === 'shell_exec') {
    const out = (data.stdout || '').slice(0, 500);
    const err = (data.stderr || '').slice(0, 300);
    return `⚙️ نتيجة:\n\`\`\`\n${out || err || 'ok'}\n\`\`\``;
  }

  return `✅ ${toolName}:\n${JSON.stringify(data).slice(0, 800)}`;
}

async function runAgentLoop(userMessage, ctx) {
  let conversation = buildAgentPrompt(userMessage, ctx);
  const toolResults = [];

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (step > 1) await sleep(STEP_DELAY_MS);

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
      console.warn('[agent] step ' + step + ' no valid JSON');
      continue;
    }

    if (parsed.action === 'tool' && parsed.tool) {
      console.log('[agent] step ' + step + ': tool=' + parsed.tool);
      let toolResult;
      try {
        toolResult = await executeTool(parsed.tool, parsed.params || {});
      } catch (e) {
        toolResult = { ok: false, error: e.message };
      }

      toolResults.push({ tool: parsed.tool, result: toolResult, params: parsed.params || {} });

      const resultText = JSON.stringify(toolResult).slice(0, 2000);
      const emoji = toolResult.ok ? '✅' : '❌';
      conversation += `\n\n${emoji} نتيجة ${parsed.tool}:\n${resultText}\n\nأعد JSON فقط.`;
      continue;
    }

    if (parsed.action === 'final') {
      const summary = cleanText(parsed.text || '');
      if (hasHallucination(summary)) {
        console.warn('[agent] final text hallucination');
        continue;
      }

      if (toolResults.length > 0) {
        const parts = [];
        if (summary && summary.length > 5) {
          parts.push(summary);
          parts.push('');
        }
        for (const tr of toolResults) {
          parts.push(formatToolResult(tr.tool, tr.result, tr.params));
          parts.push('');
        }
        console.log('[agent] final at step ' + step + ' with ' + toolResults.length + ' tool results');
        return parts.join('\n').trim();
      }

      if (summary && summary.length > 5) {
        return summary;
      }
    }
  }

  if (toolResults.length > 0) {
    return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
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
  let clean = s;
  clean = clean.replace(/<pre>/gi, '\n```\n').replace(/<\/pre>/gi, '\n```\n');
  clean = clean.replace(/<code>/gi, '`').replace(/<\/code>/gi, '`');
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  clean = clean.replace(/<[^>]+>/g, '');
  if (clean.length > 2000) clean = clean.slice(0, 2000) + '\n…(مختصر)';
  return clean;
}

// ═══════════════════════════════════════════════════════════
// إرسال آمن — يقص الرسائل الطويلة إلى أجزاء
// ═══════════════════════════════════════════════════════════
async function sendTelegramSafe(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed !== 'function') return { delivered: false };

    let payload = String(text);
    if (payload.length <= TELEGRAM_MAX_LEN) {
      return await mod.sendMessageDetailed(payload);
    }

    // تقسيم لرسائل
    const parts = [];
    let remaining = payload;
    while (remaining.length > 0 && parts.length < 3) {
      if (remaining.length <= TELEGRAM_MAX_LEN) {
        parts.push(remaining);
        remaining = '';
        break;
      }
      // نقطع عند آخر سطر
      let cut = remaining.lastIndexOf('\n', TELEGRAM_MAX_LEN - 100);
      if (cut < TELEGRAM_MAX_LEN / 2) cut = TELEGRAM_MAX_LEN - 100;
      parts.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }

    let lastResult = { delivered: false };
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.length > 1 ? `[${i + 1}/${parts.length}]\n` : '';
      lastResult = await mod.sendMessageDetailed(prefix + parts[i]);
    }
    return lastResult;
  } catch (err) {
    console.error('[team] sendTelegramSafe error: ' + err?.message);
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
  generateAgentReplies(message).catch(err => console.error('[team] failed: ' + err?.message));
  return message;
}

async function generateAgentReplies(message) {
  console.log('[team] === agent mode (deep) ===');
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
