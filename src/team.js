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
// System Prompt لـ أورورا (الوكيل الوحيد)
// ─────────────────────────────────────────────
function buildAuroraPrompt(userMessage) {
  const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return `أنت "أورورا" — المنسّقة العامة لفريق "عمالقة الصمت". القائد محمد عباس كتب لك أمراً، وعليك أن:

1. تفهمي الأمر بعمق
2. تحلّلي الموقف من زاوية كل قسم من أقسام الفريق:
   - المخطط: كيف يخطط؟
   - المنفذ: كيف ينفذ؟
   - المراجع: كيف يراجع؟
   - المستخبر: ماذا يبحث؟
3. تكتبي تقريراً واحداً موحّداً بصوتك أنتِ (ليس 5 آراء)

قواعد الكتابة:
- اكتبي بالعربية الفصحى الواضحة.
- ادخلي في الموضوع مباشرة — بدون "مرحباً" أو "تم استلام".
- استخدمي تنسيقاً بسيطاً: عنوان + نقاط مرقّمة عند الحاجة.
- لا تستخدمي JSON، لا أقواس، لا رموز برمجية.
- لا تختلقي معلومات. إذا لا تعرفي شيئاً، قولي ذلك بوضوح.
- الطول: بين 100 و400 كلمة.

التاريخ: ${timeStr} UTC

أمر القائد:
"""
${userMessage}
"""

اكتبي التقرير الموحّد الآن:`;
}

// ─────────────────────────────────────────────
// تنظيف الردود من JSON
// ─────────────────────────────────────────────
function cleanAgentResponse(text) {
  let clean = String(text || '').trim();

  // محاولة JSON
  try {
    if (clean.startsWith('{') || clean.startsWith('[')) {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length) {
        const f = parsed[0];
        clean = (typeof f === 'object')
          ? (f.response || f.report || f.text || f.message || JSON.stringify(f))
          : String(f);
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
  clean = clean.replace(/^\s*"\s*|\s*"$/g, '');

  // أرقام فقط
  if (/^\[?\d{8,}\]?$/.test(clean)) clean = '';

  // JSON طويل مع { كثير
  if ((clean.match(/[{]/g) || []).length > 3) clean = '';

  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();

  if (clean.length > 3800) clean = clean.slice(0, 3800) + '…';
  if (!clean || clean.length < 15) clean = 'لم أتمكن من معالجة الأمر. يرجى إعادة صياغته بشكل أوضح.';

  return clean;
}

// تنظيف الرسائل المخزّنة (لحل الصفحة السوداء)
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
  console.log('[team] aurora-only mode, message=' + String(message.body).slice(0, 50));

  // إعلام القائد ببدء المعالجة
  await sendTelegramSafe(
    `📥 <b>أورورا تستلم أمرك</b>\n\n«${String(message.body).slice(0, 300)}»\n\n⏳ جارٍ التحليل...`
  );

  let report;
  try {
    const prompt = buildAuroraPrompt(message.body);
    // noJsonMode — لا نريد JSON
    const rawOutput = await callModel('aurora', prompt, { noJsonMode: true });
    report = cleanAgentResponse(rawOutput);
  } catch (e) {
    console.error('[team] aurora failed:', e?.message);
    report = 'لم أتمكن من معالجة الأمر بسبب خطأ تقني. يرجى المحاولة مجدداً.';
  }

  // حفظ في DB
  insertAgentMessage('aurora', report);

  // إرسال تقرير واحد فقط
  const finalText = [
    `📋 <b>تقرير أورورا</b>`,
    ``,
    `<b>الأمر:</b> «${String(message.body).slice(0, 200)}»`,
    ``,
    `━━━━━━━━━━━━━━━`,
    ``,
    report,
    ``,
    `⏰ ${new Date().toISOString().slice(11, 16)} UTC`
  ].join('\n');

  await sendTelegramSafe(finalText);
  await notify('team_message', `تقرير جديد من أورورا`, message.body.slice(0, 500));
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
