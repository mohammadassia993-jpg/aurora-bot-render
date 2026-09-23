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
// فهرس الملفات — يُبنى مرة واحدة عند البدء
// ═══════════════════════════════════════════════════════════
let FILE_INDEX = null;
let FILE_INDEX_BUILT_AT = 0;

async function buildFileIndex() {
  const now = Date.now();
  if (FILE_INDEX && (now - FILE_INDEX_BUILT_AT) < 10 * 60 * 1000) {
    return FILE_INDEX;
  }

  const index = new Map();
  const rootsToScan = [
    config.root,
    process.cwd(),
    path.join(process.cwd(), 'src'),
    '/opt/render/project/src',
    '/opt/render/project/src/src'
  ];

  async function scan(dir, depth = 0) {
    if (depth > 4) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'data') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(full, depth + 1);
        } else if (entry.isFile()) {
          // اسم الملف → مسار كامل
          if (!index.has(entry.name)) {
            index.set(entry.name, full);
          }
        }
      }
    } catch { /* skip inaccessible */ }
  }

  for (const root of rootsToScan) {
    try {
      const stats = await fs.stat(root);
      if (stats.isDirectory()) {
        await scan(root);
      }
    } catch { /* skip */ }
  }

  FILE_INDEX = index;
  FILE_INDEX_BUILT_AT = now;
  console.log('[team] file index built: ' + index.size + ' files from ' + rootsToScan.length + ' roots');
  return index;
}

async function readFileByName(filename) {
  try {
    const index = await buildFileIndex();
    const fullPath = index.get(filename);

    if (!fullPath) {
      console.warn('[team] file not in index: ' + filename);
      return null;
    }

    const stats = await fs.stat(fullPath);
    if (stats.size > 200 * 1024) {
      console.warn('[team] file too large: ' + filename + ' (' + stats.size + ' bytes)');
      return null;
    }

    const content = await fs.readFile(fullPath, 'utf8');
    console.log('[team] loaded: ' + fullPath + ' (' + stats.size + ' bytes)');
    return { path: fullPath, size: stats.size, content: content.slice(0, 12000) };
  } catch (e) {
    console.warn('[team] read failed for ' + filename + ': ' + e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// كشف أسماء الملفات في السؤال
// ═══════════════════════════════════════════════════════════
function detectMentionedFiles(text) {
  const files = new Set();
  const str = String(text);

  // ابحث عن أي شيء ينتهي بـ .js .json .md .txt .env .yml .yaml
  const regex = /([\w\-]+\.(?:js|json|md|txt|env|yml|yaml|html|css))/gi;
  const matches = str.matchAll(regex);
  for (const m of matches) {
    const name = m[1];
    if (name.includes('..') || name.length < 3) continue;
    files.add(name);
  }

  const result = [...files].slice(0, 3);
  console.log('[team] detected files in message: ' + (result.join(', ') || 'none'));
  return result;
}

async function collectFileContexts(userMessage) {
  const mentioned = detectMentionedFiles(userMessage);
  if (!mentioned.length) return [];

  const contexts = [];
  for (const filename of mentioned) {
    const data = await readFileByName(filename);
    if (data) contexts.push(data);
  }
  return contexts;
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
      SELECT scope, error_type, message, last_seen FROM errors
      WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours')
      ORDER BY last_seen DESC LIMIT 5
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
      tasks: tasksByStatus,
      errors: recentErrors,
      approvals: pendingApprovals,
      agents: activeAgents,
      products: products
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════════
function buildAuroraPrompt(userMessage, ctx, fileContexts) {
  let filesSection = '';
  if (fileContexts.length > 0) {
    filesSection = '\n════════ محتوى الملفات المذكورة في السؤال ════════\n\n';
    for (const f of fileContexts) {
      filesSection += `── ${f.path} (${f.size} bytes) ──\n`;
      filesSection += '```\n' + f.content + '\n```\n\n';
    }
  } else {
    filesSection = '\n════════ ملاحظة ════════\n';
    filesSection += 'لم يُذكر أي ملف في سؤالك، أو لم أتمكن من قراءته.\n';
    filesSection += 'إذا كنت تريد تحليل ملف، اذكر اسمه صراحة (مثل: config.js أو team.js).\n';
  }

  return `أنت "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". أنتِ ذكية، صريحة، ودودة. تتحدثين مع قائدك محمد عباس.

════════ بيانات النظام ════════

${JSON.stringify(ctx, null, 2)}

${filesSection}

════════ قواعد صارمة ════════

1. تحدثي كإنسان حقيقي، بأسلوب طبيعي ودافئ.
2. استخدمي البيانات الحقيقية والملفات المرفقة أعلاه.
3. إذا ذكر القائد ملفاً ولم تجديه، قولي: "لم أجد الملف — تأكد من الاسم أو المسار".
4. لا تختلقي معلومات. لا تتكلمي عن أشياء غير موجودة (لا خصوم، لا حروب، لا استخبارات).
5. اكتبي بالعربية الفصحى، بدون مقدمات.
6. إذا طلب القائد تحسينات على ملف: اقرئي الملف أعلاه بعناية، حلّلي الكود، ثم اقترحي 3 تحسينات محددة بأمثلة كود.
7. إذا سأل عن حالة النظام: اذكري المكونات السليمة والمشاكل والمهام.
8. الطول: حسب السؤال.

════════ أمر القائد ════════

${userMessage}

════════ اكتبي ردّك الآن (نص عربي طبيعي فقط):`;
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
               .replace(/`([^`]+)`/g, '$1')
               .replace(/^\s*\{[\s\S]*\}\s*$/gm, '');
  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();
  if (clean.length > 3500) clean = clean.slice(0, 3500) + '…';
  return clean || null;
}

// ═══════════════════════════════════════════════════════════
// توليد الرد
// ═══════════════════════════════════════════════════════════
async function generateSmartReply(userMessage, ctx, fileContexts) {
  const prompt = buildAuroraPrompt(userMessage, ctx, fileContexts);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callModel('aurora', prompt, { noJsonMode: true });
      const clean = cleanAgentResponse(raw);
      if (!clean || clean.length < 10) { console.warn('[team] empty, attempt ' + attempt); continue; }
      if (hasHallucination(clean)) { console.warn('[team] hallucination, attempt ' + attempt); continue; }
      console.log('[team] reply ok, length=' + clean.length);
      return clean;
    } catch (e) {
      console.error('[team] attempt ' + attempt + ' failed: ' + e?.message);
    }
  }

  return buildDataFallback(ctx);
}

function buildDataFallback(ctx) {
  if (ctx.error) return `تعذر قراءة بيانات النظام: ${ctx.error}`;
  return `حالة النظام: ${ctx.health.healthy} من ${ctx.health.total} مكونات سليمة. حاول مرة أخرى.`;
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
  console.log('[team] === processing: ' + String(message.body).slice(0, 60) + ' ===');

  // 1) بناء فهرس الملفات (يُخزّن 10 دقائق)
  await buildFileIndex();

  // 2) جمع بيانات النظام
  const ctx = collectSystemSnapshot();
  console.log('[team] health=' + ctx.health?.healthy + '/' + ctx.health?.total);

  // 3) قراءة الملفات المذكورة
  const fileContexts = await collectFileContexts(message.body);
  console.log('[team] files read: ' + fileContexts.length);

  // 4) توليد الرد
  const reply = await generateSmartReply(message.body, ctx, fileContexts);

  // 5) حفظ + إرسال
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
