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

const AGENT_PROFILES = {
  aurora: { name: 'أورورا', role: 'المنسّقة العامة', mission: 'تنسيق الفريق وتقديم ملخص نهائي شامل.', style: 'منظّمة، حاسمة، شاملة.' },
  planner: { name: 'المخطط', role: 'المخطّط الاستراتيجي', mission: 'تفكيك المهام إلى خطوات قابلة للتنفيذ.', style: 'تحليلي، منهجي.' },
  executor: { name: 'المنفذ', role: 'المُنفّذ الميداني', mission: 'تنفيذ الخطوات وإنتاج مخرجات ملموسة.', style: 'عملي، مباشر.' },
  reviewer: { name: 'المراجع', role: 'مراقب الجودة', mission: 'فحص المخرجات واكتشاف الأخطاء.', style: 'دقيق، ناقد بنّاء.' },
  scout: { name: 'المستخبر', role: 'راصد الفرص', mission: 'البحث عن المعلومات والفرص.', style: 'فضولي، موضوعي.' }
};

const AGENT_NAMES = { aurora: 'أورورا', planner: 'المخطط', executor: 'المنفذ', reviewer: 'المراجع', scout: 'المستخبر' };

function buildAgentSystemPrompt(agentId) {
  const p = AGENT_PROFILES[agentId] || AGENT_PROFILES.aurora;
  const t = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `أنت "${p.name}" — ${p.role} في فريق "عمالقة الصمت".

مهمتك: ${p.mission}
أسلوبك: ${p.style}

قواعد صارمة:
- أعد نصاً عربياً مباشراً فقط. لا JSON، لا أقواس، لا رموز.
- لا تبدأ بـ "مرحباً" أو "تم استلام".
- ادخل في الموضوع مباشرة.
- الطول: بين 30 و 200 كلمة.
- إذا لا تعرف معلومة، قل ذلك بوضوح ولا تختلق.

التاريخ: ${t} UTC

رسالة القائد:
`;
}

function getRecentTeamContext(limit = 6) {
  try {
    const rows = db.prepare(`SELECT sender, body FROM messages WHERE thread='team' ORDER BY id DESC LIMIT ?`).all(limit);
    if (!rows.length) return '';
    return rows.reverse().map(r => `[${r.sender}]: ${String(r.body).slice(0, 150)}`).join('\n');
  } catch { return ''; }
}

// تنظيف قوي جداً
function cleanAgentResponse(text) {
  let clean = String(text || '').trim();

  // محاولة JSON
  try {
    if (clean.startsWith('{') || clean.startsWith('[')) {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length) {
        const f = parsed[0];
        clean = (typeof f === 'object') ? (f.response || f.report || f.text || f.message || JSON.stringify(f)) : String(f);
      } else if (typeof parsed === 'object' && parsed !== null) {
        clean = parsed.response || parsed.report || parsed.text || parsed.message || JSON.stringify(parsed);
      }
    }
  } catch { /* not JSON */ }

  // استخراج response/report من JSON مقطوع
  const rMatch = clean.match(/"response"\s*:\s*"([^"]{15,})"/);
  if (rMatch) clean = rMatch[1];
  else {
    const repMatch = clean.match(/"report"\s*:\s*"([^"]{15,})"/);
    if (repMatch) clean = repMatch[1];
  }

  // إذا بدأ بـ JSON-like بدون { (مثل: system_healthy","components":...)
  if (/^[a-zA-Z_][\w\-]*"\s*[,:]/.test(clean) || /^[a-zA-Z_][\w\-]*\s*",/.test(clean)) {
    const firstMatch = clean.match(/^"?([^",{}]{10,}?)"?\s*[,}]/);
    if (firstMatch) clean = firstMatch[1];
  }

  // markdown
  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1');

  // بقايا JSON
  clean = clean.replace(/^\s*[\{\[]\s*"?[\w_]+"?\s*:\s*/i, '');
  clean = clean.replace(/\s*[\}\]]\s*$/i, '');
  clean = clean.replace(/^\s*"\s*|\s*"\s*$/g, '');

  // أرقام فقط
  if (/^\[?\d{8,}\]?$/.test(clean)) clean = '';

  // نهاية JSON مقطوع (يحتوي { كثير)
  if ((clean.match(/[{]/g) || []).length > 3) clean = '';

  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();

  if (clean.length > 800) clean = clean.slice(0, 800) + '…';
  if (!clean || clean.length < 15) clean = 'لم أتمكن من توليد ردّ مفيد لهذا الأمر.';

  return clean;
}

// تنظيف رسالة مخزّنة عند القراءة (يحل الصفحة السوداء)
function sanitizeStoredBody(body) {
  const s = String(body || '');
  const looksLikeJson =
    s.startsWith('{') || s.startsWith('[') ||
    s.includes('"response"') || s.includes('"status"') ||
    s.includes('"components"') || s.includes('"telegram"') ||
    /^[a-zA-Z_][\w\-]*"\s*[,:]/.test(s) ||
    (s.match(/[{]/g) || []).length > 2;

  if (looksLikeJson) {
    return cleanAgentResponse(s);
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
  const targets = message.recipient === 'all'
    ? ['aurora', 'planner', 'executor', 'reviewer', 'scout']
    : [message.recipient];

  console.log('[team] generateAgentReplies, targets=' + targets.length);

  const teamContext = getRecentTeamContext(6);
  const replies = {};

  for (const agent of targets.filter(id => AGENTS.some(a => a.id === id))) {
    try {
      const systemPrompt = buildAgentSystemPrompt(agent);
      const fullPrompt = teamContext
        ? `${systemPrompt}\n\nسياق سابق:\n${teamContext}\n\nالرسالة:\n${message.body}\n\nردّك:`
        : `${systemPrompt}${message.body}\n\nردّك:`;

      // ← هنا نستخدم noJsonMode
      const rawOutput = await callModel(agent, fullPrompt, { noJsonMode: true });
      const cleanOutput = cleanAgentResponse(rawOutput);
      insertAgentMessage(agent, cleanOutput);
      replies[agent] = cleanOutput;
    } catch (e) {
      console.error('[team] agent failed:', agent, e?.message);
      const fallback = 'لم أتمكن من معالجة الأمر بسبب خطأ تقني.';
      insertAgentMessage(agent, fallback);
      replies[agent] = fallback;
    }
  }

  // تقرير موحّد واحد فقط
  const unified = buildUnifiedReport(message, replies);
  await sendTelegramSafe(unified);

  await notify('team_message', `رسالة فريق جديدة من ${message.sender}`, message.body.slice(0, 500));
}

function buildUnifiedReport(message, replies) {
  const lines = [
    `📋 <b>تقرير الفريق</b>`,
    ``,
    `<b>الأمر:</b> «${String(message.body).slice(0, 200)}»`,
    ``
  ];

  for (const [agent, body] of Object.entries(replies)) {
    const name = AGENT_NAMES[agent] || agent;
    lines.push(`<b>💬 ${name}</b>`);
    lines.push(body.slice(0, 700));
    lines.push('');
  }

  lines.push(`⏰ ${new Date().toISOString().slice(11, 16)} UTC`);

  let text = lines.join('\n');
  if (text.length > 4000) text = text.slice(0, 3950) + '\n…';
  return text;
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
