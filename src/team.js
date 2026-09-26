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
  { id: 'aurora', name: 'أورورا', role: 'Supervisor and orchestration', icon: '/icons/aurora.svg', color: '#a78bfa' },
  { id: 'planner', name: 'المخطط', role: 'Strategy and task breakdown', icon: '/icons/planner.svg', color: '#60a5fa' },
  { id: 'executor', name: 'المنفذ', role: 'Implementation and delivery', icon: '/icons/executor.svg', color: '#34d399' },
  { id: 'reviewer', name: 'المراجع', role: 'Quality and compliance', icon: '/icons/reviewer.svg', color: '#fbbf24' },
  { id: 'scout', name: 'المستخبر', role: 'Research and opportunities', icon: '/icons/scout.svg', color: '#f472b6' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

const MAX_AGENT_STEPS = 10;
const STEP_DELAY_MS = 700;
const TELEGRAM_MAX_LEN = 3800;

const CRITICAL_TOOLS = new Set(['write_file', 'render_env_set']);

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

function buildAgentPrompt(userMessage, ctx) {
  const toolsList = AVAILABLE_TOOLS.map(t => {
    const params = Object.entries(t.params || {}).map(([k, v]) => `      "${k}": ${v}`).join(',\n');
    return `• ${t.name}\n  ${t.description}\n  params: {\n${params}\n  }`;
  }).join('\n\n');

  return `أنت "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". مهمتك تنفيذ أوامر القائد بدقة وأمان.

═══════════════ بيانات النظام ═══════════════
${JSON.stringify(ctx, null, 2)}

═══════════════ الأدوات المتاحة ═══════════════
${toolsList}

═══════════════ شكل الرد المطلوب ═══════════════
يجب أن يكون ردّك JSON واحد فقط. لا نص قبله، لا نص بعده، لا markdown، لا \`\`\`.

شكل 1 — تنفيذ أداة:
{"action":"tool","tool":"اسم_الأداة","params":{...}}

شكل 2 — إنهاء المهمة:
{"action":"final","text":"الرد النهائي بالعربية"}

═══════════════ أمثلة ═══════════════

مثال 1 — اقرأ config.js:
{"action":"tool","tool":"read_file","params":{"file_path":"config.js"}}

مثال 2 — أنهِ:
{"action":"final","text":"قرأت الملف. يحتوي على..."}

مثال 3 — عدّل سطراً:
{"action":"tool","tool":"github_edit_file","params":{"path":"src/wallets.js","search":"// wallets module v2","replace":"// wallets module v3","message":"chore: update comment"}}

═══════════════ 🚨 قواعد github_edit_file (مهم جداً) ═══════════════

1. **search نص عادي — لا regex**:
   - ❌ ممنوع: "^// wallets"  أو  "$"  أو  "\\d+"  أو  ".*"
   - ✅ الصحيح: "// wallets module v2"  (نسخة حرفية من الملف)

2. **search يجب أن يطابق حرفياً** ما في الملف (حتى المسافات والرموز).
   - قبل التعديل، اقرأ الملف بـ read_file وتأكد من السطر بالضبط.
   - انسخ السطر كما هو (بدون ^ أو $ أو أي إضافات).

3. **search فريد** — لو السطر يظهر أكثر من مرة، أضف سياقاً (أسطر قبله/بعده) ليكون فريداً.

4. **replace يحتوي على السطر الجديد كاملاً**، لا جزء منه فقط.

═══════════════ 🚨 قواعد التحقق (إلزامية) ═══════════════

5. **قبل أي تعديل**: اقرأ الملف (read_file) لترى السطر الفعلي.

6. **بعد نجاح github_edit_file**:
   - اقرأ الملف مرة أخرى بـ read_file على نفس المسار.
   - تحقق أن التعديل طُبِّق بشكل صحيح.
   - إذا سليم → final مع ملخص.
   - إذا خطأ → أصلحه.

7. **بعد نجاح write_file أو render_env_set** → توقف فوراً وأعد final.

═══════════════ قواعد عامة ═══════════════

8. JSON واحد فقط — لا نص إضافي.
9. خطوة واحدة في كل رد.
10. لا تُكرر نفس الأداة بنفس المعاملات.
11. لا تختلق معلومات.
12. عند الفشل، جرّب زاوية مختلفة.

═══════════════ أمر القائد ═══════════════
${userMessage}

ردّك JSON الآن:`;
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
  if (!toolResult || !toolResult.ok) return `❌ فشل ${toolName}: ${String(toolResult?.error || 'unknown').slice(0, 500)}`;
  const data = toolResult.result;
  if (toolName === 'grep_files') {
    if (!data?.results?.length) return `🔍 لا نتائج لـ "${originalParams?.pattern}"`;
    const lines = [`🔍 "${originalParams?.pattern}" (${data.results_count} نتيجة):`, ''];
    for (const r of data.results.slice(0, 20)) { lines.push(`📄 ${r.file}:${r.line}`); lines.push(`   ${String(r.text).slice(0, 150)}`); }
    return lines.join('\n');
  }
  if (toolName === 'read_file') { if (!data?.content) return '📄 فارغ'; return `📄 ${data.path || ''} (${data.total_lines || '?'} سطر):\n\`\`\`\n${String(data.content).slice(0, 2500)}\n\`\`\``; }
  if (toolName === 'read_many_files') {
    if (!data?.files) return '📄 لا ملفات';
    const lines = [`📚 ${data.count} ملف:`, ''];
    for (const f of data.files) { if (f.error) lines.push(`❌ ${f.file}: ${f.error}`); else { lines.push(`📄 ${f.file} (${f.size}B):`); lines.push(`\`\`\`\n${String(f.content).slice(0, 1000)}\n\`\`\``); lines.push(''); } }
    return lines.join('\n');
  }
  if (toolName === 'list_files') { if (!data?.items) return '📂 فارغ'; return `📂 ${data.dir} (${data.count}):\n` + data.items.slice(0, 60).map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.path}`).join('\n'); }
  if (toolName === 'web_search') {
    if (!data?.results?.length) return `🌐 لا نتائج لـ "${originalParams?.query}"`;
    const lines = [`🌐 "${originalParams?.query}":`, ''];
    for (let i = 0; i < data.results.length; i++) { const r = data.results[i]; lines.push(`${i+1}. ${r.title}`); if (r.snippet) lines.push(`   ${String(r.snippet).slice(0, 200)}`); if (r.url) lines.push(`   🔗 ${r.url}`); lines.push(''); }
    return lines.join('\n');
  }
  if (toolName === 'render_env_get') { if (!data?.vars) return '🔧 لا متغيرات'; return `🔧 متغيرات Render (${data.count}):\n` + data.vars.slice(0, 60).map(v => '• ' + v.key).join('\n'); }
  if (toolName === 'render_env_set') return `✅ تم تحديث ${data.key}`;
  if (toolName === 'github_edit_file') return `✅ تم تعديل ${data.path} (${data.replacements} استبدال)\n🔗 ${data.commitUrl}\n\n⚠️ الآن اقرأ الملف للتحقق (read_file على ${data.path})`;
  if (toolName === 'github_api') return `✅ GitHub API: ${data.status || 'ok'}\n${JSON.stringify(data.data || {}).slice(0, 500)}`;
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
  let consecutiveFailures = 0;
  const executedOps = new Set();
  let lastCriticalTool = null;
  let lastEditFile = null;

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (step > 1) await sleep(STEP_DELAY_MS);
    let raw;
    try { raw = await callModel('aurora', conversation, { noJsonMode: false }); }
    catch (e) { console.error('[agent] step ' + step + ' LLM: ' + e.message); continue; }

    if (!raw || String(raw).trim().length < 5) { consecutiveFailures++; continue; }

    const parsed = parseAgentResponse(raw);
    if (!parsed || !parsed.action) {
      console.warn('[agent] step ' + step + ' invalid JSON. Preview: ' + String(raw).slice(0, 200));
      conversation += `\n\n⚠️ ردك السابق لم يكن JSON صالحاً. أعد بـ JSON فقط بدون نص.\n\nردّك JSON الآن:`;
      consecutiveFailures++;
      if (consecutiveFailures >= 4) { console.error('[agent] too many JSON failures'); return null; }
      continue;
    }

    consecutiveFailures = 0;

    if (parsed.action === 'tool' && parsed.tool) {
      console.log('[agent] step ' + step + ': tool=' + parsed.tool);

      const opKey = parsed.tool + '|' + JSON.stringify(parsed.params || {});
      if (executedOps.has(opKey)) {
        console.warn('[agent] duplicate op → force stop');
        return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
      }
      executedOps.add(opKey);

      let toolResult;
      try { toolResult = await executeTool(parsed.tool, parsed.params || {}); }
      catch (e) { toolResult = { ok: false, error: e.message }; }
      toolResults.push({ tool: parsed.tool, result: toolResult, params: parsed.params || {} });

      if (parsed.tool === 'github_edit_file' && toolResult.ok) {
        lastEditFile = parsed.params?.path || parsed.params?.file_path || null;
      }

      if (parsed.tool === 'read_file' && lastEditFile) {
        const readPath = parsed.params?.file_path || parsed.params?.path;
        if (readPath === lastEditFile) lastEditFile = null;
      }

      if (toolResult.ok && CRITICAL_TOOLS.has(parsed.tool)) {
        if (lastCriticalTool === parsed.tool) {
          return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
        }
        lastCriticalTool = parsed.tool;
        return toolResults.map(tr => formatToolResult(tr.tool, tr.result, tr.params)).join('\n\n');
      }

      const txt = JSON.stringify(toolResult).slice(0, 2500);
      const emoji = toolResult.ok ? '✅' : '❌';
      let hint = '';
      if (parsed.tool === 'github_edit_file' && toolResult.ok && lastEditFile) {
        hint = `\n\n⚠️ إلزامي: اقرأ الملف الآن بـ read_file على "${lastEditFile}" للتحقق.`;
      }
      if (parsed.tool === 'github_edit_file' && !toolResult.ok) {
        hint = `\n\n💡 تذكير: search نص عادي (بدون ^ $ \\d .*). انسخ السطر من الملف حرفياً.`;
      }
      conversation += `\n\n${emoji} نتيجة ${parsed.tool}:\n${txt}${hint}\n\nاستمر: أعد JSON.`;
      continue;
    }

    if (parsed.action === 'final') {
      if (lastEditFile) {
        conversation += `\n\n⚠️ لا يمكن الإنهاء قبل التحقق من ${lastEditFile}. اقرأه بـ read_file.\n\nردّك JSON الآن:`;
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
  const lines = [`⚠️ لم أتمكن من معالجة أمرك`];
  if (ctx.error) lines.push(`خطأ: ${ctx.error}`);
  lines.push(`حالة النظام: ${ctx.health?.healthy || 0}/${ctx.health?.total || 0} سليمة`);
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
