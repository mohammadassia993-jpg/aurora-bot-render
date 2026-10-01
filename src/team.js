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
  { id: 'aurora', name: 'أورورا', role: 'Supervisor', icon: '/icons/aurora.svg', color: '#a78bfa' },
  { id: 'planner', name: 'المخطط', role: 'Strategy', icon: '/icons/planner.svg', color: '#60a5fa' },
  { id: 'executor', name: 'المنفذ', role: 'Implementation', icon: '/icons/executor.svg', color: '#34d399' },
  { id: 'reviewer', name: 'المراجع', role: 'Quality', icon: '/icons/reviewer.svg', color: '#fbbf24' },
  { id: 'scout', name: 'المستخبر', role: 'Research', icon: '/icons/scout.svg', color: '#f472b6' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

// ✅ تقليص: 5 خطوات بدل 10
const MAX_AGENT_STEPS = 5;
const STEP_DELAY_MS = 500;
const TELEGRAM_MAX_LEN = 3800;
const CRITICAL_TOOLS = new Set(['write_file', 'render_env_set']);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function collectSystemSnapshot() {
  try {
    const health = db.prepare(`SELECT component, healthy FROM health_checks WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)`).all();
    return {
      time: new Date().toISOString().slice(0, 16).replace('T', ' '),
      healthy: health.filter(h => h.healthy === 1).length,
      total: health.length
    };
  } catch (e) { return { error: e.message }; }
}

// ✅ prompt مختصر جداً — من ~4000 tokens إلى ~800
function buildAgentPrompt(userMessage, ctx) {
  const toolsList = AVAILABLE_TOOLS.map(t => `• ${t.name}: ${t.description}`).join('\n');

  return `أنت أورورا — منسقة فريق عمالقة الصمت.

حالة النظام: ${ctx.healthy}/${ctx.total} سليمة.

الأدوات:
${toolsList}

الشكل المطلوب — JSON واحد فقط:
- تنفيذ: {"action":"tool","tool":"name","params":{...}}
- إنهاء: {"action":"final","text":"الرد"}

قواعد:
1. اقرأ الملف قبل تعديله
2. search في github_edit_file = نص حرفي (لا regex)
3. بعد github_edit_file: التحقق تلقائي — لا تكرر
4. لا تكرر نفس الأداة بنفس المعاملات

أمر القائد:
${userMessage}

JSON:`;
}

function parseAgentResponse(raw) {
  const str = String(raw || '').trim();
  if (!str) return null;
  try { const p = JSON.parse(str); if (p && typeof p === 'object') return p; } catch {}
  const start = str.indexOf('{'); if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        try { const p = JSON.parse(str.slice(start, i + 1)); if (p && typeof p === 'object') return p; } catch { return null; }
        return null;
      }
    }
  }
  return null;
}

const FORBIDDEN = ['الخصوم', 'الأعداء', 'الحدود', 'الحرب', 'المعارك', 'الجيش', 'العسكري', 'الجاسوس'];
function hasHallucination(text) {
  const l = String(text).toLowerCase();
  return FORBIDDEN.some(t => l.includes(t.toLowerCase()));
}

function cleanText(text) {
  let c = String(text || '').trim();
  c = c.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1');
  return c.split('\n').filter(l => l.trim()).join('\n').trim();
}

function formatToolResult(toolName, toolResult, originalParams) {
  if (!toolResult || !toolResult.ok) return `❌ فشل ${toolName}: ${String(toolResult?.error || 'unknown').slice(0, 300)}`;
  const data = toolResult.result;
  if (toolName === 'grep_files') {
    if (!data?.results?.length) return `🔍 لا نتائج لـ "${originalParams?.pattern}"`;
    const lines = [`🔍 "${originalParams?.pattern}" (${data.results_count}):`];
    for (const r of data.results.slice(0, 10)) lines.push(`📄 ${r.file}:${r.line} → ${String(r.text).slice(0, 120)}`);
    return lines.join('\n');
  }
  if (toolName === 'read_file') { if (!data?.content) return '📄 فارغ'; return `📄 ${data.path || ''} (${data.total_lines || '?'}):\n${String(data.content).slice(0, 1500)}`; }
  if (toolName === 'read_many_files') {
    if (!data?.files) return '📄 لا ملفات';
    const lines = [`📚 ${data.count} ملف:`];
    for (const f of data.files) { if (f.error) lines.push(`❌ ${f.file}: ${f.error}`); else lines.push(`📄 ${f.file} (${f.size}B):\n${String(f.content).slice(0, 600)}`); }
    return lines.join('\n');
  }
  if (toolName === 'list_files') { if (!data?.items) return '📂 فارغ'; return `📂 ${data.dir} (${data.count}):\n` + data.items.slice(0, 40).map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.path}`).join('\n'); }
  if (toolName === 'web_search') {
    if (!data?.results?.length) return `🌐 لا نتائج لـ "${originalParams?.query}"`;
    const lines = [`🌐 "${originalParams?.query}":`];
    for (let i = 0; i < Math.min(data.results.length, 5); i++) { const r = data.results[i]; lines.push(`${i+1}. ${r.title}`); if (r.snippet) lines.push(`   ${String(r.snippet).slice(0, 150)}`); if (r.url) lines.push(`   🔗 ${r.url}`); }
    return lines.join('\n');
  }
  if (toolName === 'render_env_get') { if (!data?.vars) return '🔧 لا متغيرات'; return `🔧 متغيرات Render (${data.count}):\n` + data.vars.slice(0, 40).map(v => '• ' + v.key).join('\n'); }
  if (toolName === 'render_env_set') return `✅ تم تحديث ${data.key}`;
  if (toolName === 'github_edit_file') return `✅ تم تعديل ${data.path} (${data.replacements})\n🔗 ${data.commitUrl}`;
  if (toolName === 'github_api') return `✅ GitHub API: ${data.status || 'ok'}`;
  if (toolName === 'save_session') return `💾 جلسة: ${data.name}`;
  if (toolName === 'load_session') return data?.loaded ? `📂 جلسة: ${data.name}` : '❌ غير موجودة';
  if (toolName === 'send_telegram') return `✅ رسالة (id=${data.message_id})`;
  if (toolName === 'write_file') return `💾 ${data.path} (${data.bytes}B)`;
  if (toolName === 'shell_exec') return `⚙️\n${(data.stdout || data.stderr || 'ok').slice(0, 400)}`;
  return `✅ ${toolName}: ${JSON.stringify(data).slice(0, 300)}`;
}

async function autoVerify(filePath, toolResults) {
  try {
    const res = await executeTool('read_file', { file_path: filePath });
    toolResults.push({ tool: 'read_file', result: res, params: { file_path: filePath, auto: true } });
    return res;
  } catch (e) {
    toolResults.push({ tool: 'read_file', result: { ok: false, error: e.message }, params: { file_path: filePath, auto: true } });
    return { ok: false, error: e.message };
  }
}

// ✅ حذف مرحلة المراجع — توفير 50% من الاستدعاءات
async function runAgentLoop(userMessage, ctx) {
  let conversation = buildAgentPrompt(userMessage, ctx);
  const toolResults = [];
  let consecutiveFailures = 0;
  const executedOps = new Set();
  let lastCriticalTool = null;
  let pendingAutoVerify = null;

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (step > 1) await sleep(STEP_DELAY_MS);

    if (pendingAutoVerify) {
      const fp = pendingAutoVerify;
      pendingAutoVerify = null;
      console.log('[agent] auto-verify: ' + fp);
      await autoVerify(fp, toolResults);
      const last = toolResults[toolResults.length - 1];
      const preview = last.result?.ok ? String(last.result.result?.content || '').slice(0, 400) : 'فشل';
      conversation += `\n\n🔎 تحقق تلقائي:\n${preview}\n\nأنهِ المهمة بـ final.`;
      continue;
    }

    let raw;
    try { raw = await callModel('aurora', conversation, { noJsonMode: false }); }
    catch (e) { console.error('[agent] step ' + step + ' LLM: ' + e.message); continue; }

    if (!raw || String(raw).trim().length < 5) { consecutiveFailures++; continue; }

    const parsed = parseAgentResponse(raw);
    if (!parsed || !parsed.action) {
      conversation += `\n\n⚠️ أعد JSON فقط:`;
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        if (toolResults.length > 0) return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
        return null;
      }
      continue;
    }

    consecutiveFailures = 0;

    if (parsed.action === 'tool' && parsed.tool) {
      const opKey = parsed.tool + '|' + JSON.stringify(parsed.params || {});
      if (executedOps.has(opKey) && parsed.tool !== 'github_edit_file') {
        return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
      }
      executedOps.add(opKey);

      let toolResult;
      try { toolResult = await executeTool(parsed.tool, parsed.params || {}); }
      catch (e) { toolResult = { ok: false, error: e.message }; }
      toolResults.push({ tool: parsed.tool, result: toolResult, params: parsed.params || {} });

      if (parsed.tool === 'github_edit_file' && toolResult.ok) {
        const fp = parsed.params?.path || parsed.params?.file_path;
        if (fp) {
          pendingAutoVerify = fp;
          conversation += `\n\n✅ تم تعديل ${fp}. تحقق تلقائي في الخطوة التالية.`;
          continue;
        }
      }

      if (toolResult.ok && CRITICAL_TOOLS.has(parsed.tool)) {
        if (lastCriticalTool === parsed.tool) {
          return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
        }
        lastCriticalTool = parsed.tool;
        return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
      }

      const txt = JSON.stringify(toolResult).slice(0, 1500);
      const emoji = toolResult.ok ? '✅' : '❌';
      conversation += `\n\n${emoji} نتيجة ${parsed.tool}:\n${txt}\n\nاستمر بـ JSON:`;
      continue;
    }

    if (parsed.action === 'final') {
      if (pendingAutoVerify) {
        conversation += `\n\n⚠️ انتظر التحقق التلقائي.`;
        continue;
      }
      const summary = cleanText(parsed.text || '');
      if (hasHallucination(summary)) continue;

      if (toolResults.length > 0) {
        const parts = [];
        if (summary && summary.length > 5) parts.push(summary, '');
        for (const tr of toolResults) { parts.push(formatToolResult(tr.tool, tr.result, tr.params), ''); }
        return parts.join('\n').trim();
      }
      if (summary && summary.length > 5) return summary;
    }
  }

  if (toolResults.length > 0) return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
  return null;
}

function buildDiagnosticFallback(ctx) {
  return `⚠️ لم أتمكن من معالجة أمرك\nحالة النظام: ${ctx.healthy || 0}/${ctx.total || 0} سليمة`;
}

function sanitizeStoredBody(body) {
  const s = String(body || '');
  const looksJson = s.startsWith('{') || s.startsWith('[') || (s.match(/[{]/g) || []).length > 2;
  if (looksJson) {
    try { const p = JSON.parse(s); if (typeof p === 'object' && p !== null) return String(p.response || p.report || p.text || '').slice(0, 2000) || 'رد قديم'; } catch {}
    return 'رد قديم';
  }
  let clean = s.replace(/<pre>/gi, '\n```\n').replace(/<\/pre>/gi, '\n```\n').replace(/<code>/gi, '`').replace(/<\/code>/gi, '`').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  if (clean.length > 2000) clean = clean.slice(0, 2000) + '\n…';
  return clean;
}

async function sendTelegramSafe(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed !== 'function') return { delivered: false };
    const payload = String(text);
    if (payload.length <= TELEGRAM_MAX_LEN) return await mod.sendMessageDetailed(payload);
    const parts = []; let remaining = payload;
    while (remaining.length > 0 && parts.length < 3) {
      if (remaining.length <= TELEGRAM_MAX_LEN) { parts.push(remaining); break; }
      let cut = remaining.lastIndexOf('\n', TELEGRAM_MAX_LEN - 100);
      if (cut < TELEGRAM_MAX_LEN / 2) cut = TELEGRAM_MAX_LEN - 100;
      parts.push(remaining.slice(0, cut)); remaining = remaining.slice(cut);
    }
    let last = { delivered: false };
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.length > 1 ? `[${i+1}/${parts.length}]\n` : '';
      last = await mod.sendMessageDetailed(prefix + parts[i]);
    }
    return last;
  } catch (err) { return { delivered: false, error: err?.message }; }
}

export function listMessages(limit = 100) {
  const rows = db.prepare(`SELECT id, thread, sender, recipient, body, attachment_name AS attachmentName, attachment_type AS attachmentType, attachment_size AS attachmentSize, attachment_path AS attachmentPath, created_at AS createdAt FROM messages ORDER BY id DESC LIMIT ?`).all(Math.min(Number(limit) || 100, 300)).reverse();
  return rows.map(r => ({ ...r, body: sanitizeStoredBody(r.body) }));
}

export async function createMessage(input) {
  let attachment = { name: '', type: '', size: 0, path: '' };
  if (input.attachment?.base64) attachment = await saveAttachment(input.attachment);
  const result = db.prepare(`INSERT INTO messages(thread,sender,recipient,body,attachment_name,attachment_type,attachment_size,attachment_path) VALUES (?,?,?,?,?,?,?,?)`).run(input.thread || 'team', input.sender || 'leader', input.recipient || 'all', String(input.body || '').slice(0, 20000), attachment.name, attachment.type, attachment.size, attachment.path);
  const messageId = Number(result.lastInsertRowid);
  const message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  teamEvents.emit('message', { type: 'created', messageId });
  generateAgentReplies(message).catch(err => console.error('[team] failed: ' + err?.message));
  return message;
}

async function generateAgentReplies(message) {
  console.log('[team] === agent ===');
  const ctx = collectSystemSnapshot();
  let reply = await runAgentLoop(message.body, ctx);
  if (!reply) reply = buildDiagnosticFallback(ctx);
  insertAgentMessage('aurora', reply);
  await sendTelegramSafe(`💬 <b>أورورا</b>\n\n${reply}`);
  await notify('team_message', `رد أورورا`, message.body.slice(0, 500));
}

function insertAgentMessage(agent, body) {
  const result = db.prepare(`INSERT INTO messages(thread,sender,recipient,body) VALUES ('team',?,'leader',?)`).run(agent, String(body).slice(0, 20000));
  teamEvents.emit('message', { type: 'agent-reply', messageId: Number(result.lastInsertRowid), agent });
}

export async function attachmentFile(relativePath) {
  const requested = path.resolve(config.root, '.' + relativePath);
  const root = path.resolve(config.root, 'uploads');
  if (!requested.startsWith(root + path.sep)) return null;
  try { return await fs.readFile(requested); } catch { return null; }
}
