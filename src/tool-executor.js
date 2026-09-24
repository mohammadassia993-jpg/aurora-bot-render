import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';
import { executeTool, AVAILABLE_TOOLS } from './tool-executor.js';

export const AGENTS = [{ id: 'aurora', name: 'أورورا', color: '#a78bfa' }];
export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

const MAX_AGENT_STEPS = 10;
const STEP_DELAY_MS = 800;
const TELEGRAM_MAX_LEN = 3800;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function collectSystemSnapshot() {
  try {
    const health = db.prepare(`SELECT component, healthy, detail FROM health_checks WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)`).all();
    const tasksByStatus = db.prepare(`SELECT status, COUNT(*) c FROM tasks GROUP BY status`).all();
    const recentErrors = db.prepare(`SELECT scope, error_type, last_seen FROM errors WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours') ORDER BY last_seen DESC LIMIT 5`).all();
    const pendingApprovals = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE state='pending'`).get().c;
    const products = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published FROM produced_products`).get();
    return {
      time: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      health: { total: health.length, healthy: health.filter(h => h.healthy === 1).length, failing: health.filter(h => h.healthy !== 1).map(h => ({ name: h.component, reason: h.detail || '' })) },
      tasks: tasksByStatus, errors: recentErrors, approvals: pendingApprovals, products
    };
  } catch (e) { return { error: e.message }; }
}

// 🆕 نسخة مبسطة جداً من الـ prompt
function buildAgentPrompt(userMessage, ctx) {
  const toolsList = AVAILABLE_TOOLS.map(t => '- ' + t.name + ': ' + t.description).join('\n');

  return `أنت "أورورا" في فريق عمالقة الصمت. اتبع التعليمات بدقة.

النظام:
${JSON.stringify(ctx)}

الأدوات:
${toolsList}

قواعد صارمة:
1. أعد JSON فقط. لا نص قبله أو بعده.
2. صيغة الرد:
   - لتنفيذ أداة: {"action":"tool","tool":"اسم_الأداة","params":{...}}
   - للرد النهائي: {"action":"final","text":"إجابة قصيرة"}

3. ⚠️ مهم: عند تنفيذ سلسلة أوامر، نفّذ كل خطوة على حدة في نداء منفصل.
   لا تحاول تنفيذ كل شيء دفعة واحدة.

4. إذا فشلت أداة:
   - لا تُعد المحاولة بنفس الطريقة.
   - جرّب حلاً بديلاً.
   - إذا فشل مرة ثانية، أخبر المستخدم بالسبب بدقة.

5. عندما يطلب المستخدم تنفيذ مهام متسلسلة، ابدأ بالخطوة الأولى فقط. بعد نجاحها، ستُطلب منك الخطوة التالية.

أمر القائد:
${userMessage}

أعد JSON فقط:`;
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
    const lines = [`🔍 "${originalParams?.pattern}" (${data.results_count}):`, ''];
    for (const r of data.results.slice(0, 15)) { lines.push(`📄 ${r.file}:${r.line}`); lines.push(`   ${String(r.text).slice(0, 120)}`); }
    return lines.join('\n');
  }
  if (toolName === 'read_file') { if (!data?.content) return '📄 فارغ'; return `📄 ${data.path || ''} (${data.total_lines || '?'} سطر):\n\`\`\`\n${String(data.content).slice(0, 2000)}\n\`\`\``; }
  if (toolName === 'read_many_files') {
    if (!data?.files) return '📄 لا ملفات';
    const lines = [`📚 ${data.count} ملف:`, ''];
    for (const f of data.files) { if (f.error) lines.push(`❌ ${f.file}: ${f.error}`); else { lines.push(`📄 ${f.file} (${f.size}B):`); lines.push(`\`\`\`\n${String(f.content).slice(0, 800)}\n\`\`\``); lines.push(''); } }
    return lines.join('\n');
  }
  if (toolName === 'list_files') { if (!data?.items) return '📂 فارغ'; return `📂 ${data.dir} (${data.count}):\n` + data.items.slice(0, 50).map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.path}`).join('\n'); }
  if (toolName === 'web_search') {
    if (!data?.results?.length) return `🌐 لا نتائج لـ "${originalParams?.query}"`;
    const lines = [`🌐 "${originalParams?.query}":`, ''];
    for (let i = 0; i < data.results.length; i++) { const r = data.results[i]; lines.push(`${i+1}. ${r.title}`); if (r.snippet) lines.push(`   ${String(r.snippet).slice(0, 150)}`); if (r.url) lines.push(`   🔗 ${r.url}`); lines.push(''); }
    return lines.join('\n');
  }
  if (toolName === 'render_env_get') { if (!data?.vars) return '🔧 لا متغيرات'; return `🔧 متغيرات Render (${data.count}):\n` + data.vars.slice(0, 50).map(v => '• ' + v.key).join('\n'); }
  if (toolName === 'render_env_set') return `✅ تم تحديث ${data.key}\nℹ️ ${data.note}`;
  if (toolName === 'github_edit_file') return `✅ تم تعديل ${data.path} (${data.replacements} استبدال)\n🔗 ${data.commitUrl}`;
  if (toolName === 'save_session') return `💾 جلسة: ${data.name}`;
  if (toolName === 'load_session') return data?.loaded ? `📂 جلسة: ${data.name}` : '❌ غير موجودة';
  if (toolName === 'platform_fetch') { const p = typeof data.data === 'string' ? data.data.slice(0, 800) : JSON.stringify(data.data).slice(0, 800); return `🌐 ${data.status}\n\`\`\`\n${p}\n\`\`\``; }
  if (toolName === 'send_telegram') return `✅ رسالة (id=${data.message_id})`;
  if (toolName === 'write_file') return `💾 ${data.path} (${data.bytes}B)`;
  if (toolName === 'shell_exec') return `⚙️\n\`\`\`\n${(data.stdout || data.stderr || 'ok').slice(0, 600)}\n\`\`\``;
  return `✅ ${toolName}: ${JSON.stringify(data).slice(0, 800)}`;
}

async function runAgentLoop(userMessage, ctx) {
  let conversation = buildAgentPrompt(userMessage, ctx);
  const toolResults = [];

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (step > 1) await sleep(STEP_DELAY_MS);
    let raw;
    try { raw = await callModel('aurora', conversation, { noJsonMode: false }); }
    catch (e) { console.error('[agent] step ' + step + ' LLM threw: ' + e.message); continue; }
    if (!raw || String(raw).trim().length < 5) continue;

    const parsed = parseAgentResponse(raw);
    if (!parsed || !parsed.action) { console.warn('[agent] step ' + step + ' invalid JSON'); continue; }

    if (parsed.action === 'tool' && parsed.tool) {
      console.log('[agent] step ' + step + ': tool=' + parsed.tool);
      let toolResult;
      try { toolResult = await executeTool(parsed.tool, parsed.params || {}); }
      catch (e) { toolResult = { ok: false, error: e.message }; }
      toolResults.push({ tool: parsed.tool, result: toolResult, params: parsed.params || {} });
      const txt = JSON.stringify(toolResult).slice(0, 2000);
      const emoji = toolResult.ok ? '✅' : '❌';
      conversation += `\n\n${emoji} نتيجة ${parsed.tool}:\n${txt}\n\nأعد JSON فقط.`;
      continue;
    }

    if (parsed.action === 'final') {
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

// 🆕 fallback تشخيصي
function buildDiagnosticFallback(ctx, userMessage) {
  const lines = [`⚠️ لم أتمكن من معالجة أمرك`];
  if (ctx.error) lines.push(`خطأ في النظام: ${ctx.error}`);
  const recentErrors = db.prepare(`SELECT scope, error_type, message FROM errors WHERE resolved=0 AND last_seen >= datetime('now','-1 hour') ORDER BY last_seen DESC LIMIT 3`).all();
  if (recentErrors.length) {
    lines.push('');
    lines.push('آخر الأخطاء:');
    for (const e of recentErrors) lines.push(`• ${e.scope}/${e.error_type}: ${String(e.message).slice(0, 100)}`);
  }
  lines.push('');
  lines.push(`حالة النظام: ${ctx.health?.healthy || 0}/${ctx.health?.total || 0} سليمة`);
  lines.push(`يرجى إعادة صياغة الأمر بشكل أبسط أو التحقق من Logs.`);
  return lines.join('\n');
}

function sanitizeStoredBody(body) {
  const s = String(body || '');
  const looksJson = s.startsWith('{') || s.startsWith('[') || (s.match(/[{]/g) || []).length > 2;
  if (looksJson) {
    try { const p = JSON.parse(s); if (typeof p === 'object' && p !== null) return String(p.response || p.report || p.text || '').slice(0, 2000) || 'رد قديم'; } catch {}
    return 'رد قديم';
  }
  let clean = s.replace(/<pre>/gi, '\n```\n').replace(/<\/pre>/gi, '\n```\n').replace(/<code>/gi, '`').replace(/<\/code>/gi, '`').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  if (clean.length > 2000) clean = clean.slice(0, 2000) + '\n…(مختصر)';
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
  console.log('[team] === deep agent ===');
  const ctx = collectSystemSnapshot();
  let reply = await runAgentLoop(message.body, ctx);
  if (!reply) reply = buildDiagnosticFallback(ctx, message.body);
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
