import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';

export const AGENTS = [
  { id: 'aurora', name: 'أورورا', role: 'Supervisor and orchestration', icon: '/icons/aurora.svg', color: '#a78bfa' },
  { id: 'planner', name: 'المخطط', role: 'Strategy and task breakdown', icon: '/icons/planner.svg', color: '#60a5fa' },
  { id: 'executor', name: 'المنفذ', role: 'Implementation and delivery', icon: '/icons/executor.svg', color: '#34d399' },
  { id: 'reviewer', name: 'المراجع', role: 'Quality and compliance', icon: '/icons/reviewer.svg', color: '#fbbf24' },
  { id: 'scout', name: 'المستخبر', role: 'Research and opportunities', icon: '/icons/scout.svg', color: '#f472b6' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

const AGENT_PROFILES = {
  aurora: {
    name: 'أورورا',
    role: 'المنسّقة العامة للفريق',
    mission: 'تتلقى أوامر القائد، تُوزّع المهام، وتُقدّم ملخصاً نهائياً واضحاً.',
    style: 'منظّمة، حاسمة، واضحة، شاملة.'
  },
  planner: {
    name: 'المخطط',
    role: 'المخطّط الاستراتيجي',
    mission: 'تفكيك المهام إلى خطوات قابلة للتنفيذ وتقدير المخاطر.',
    style: 'تحليلي، منهجي، واقعي.'
  },
  executor: {
    name: 'المنفّذ',
    role: 'المُنفّذ الميداني',
    mission: 'تنفيذ الخطوات فعلياً وإنتاج مخرجات ملموسة.',
    style: 'عملي، مباشر، إنتاجي.'
  },
  reviewer: {
    name: 'المراجع',
    role: 'مراقب الجودة',
    mission: 'فحص المخرجات واكتشاف الأخطاء قبل التسليم النهائي.',
    style: 'دقيق، ناقد بنّاء، صريح.'
  },
  scout: {
    name: 'المستخبر',
    role: 'راصد الفرص والمعلومات',
    mission: 'البحث عن المعلومات والفرص وتقديم ملخصات ذكية.',
    style: 'فضولي، واسع الاطلاع، موضوعي.'
  }
};

function buildAgentSystemPrompt(agentId) {
  const profile = AGENT_PROFILES[agentId] || AGENT_PROFILES.aurora;
  const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return `أنت "${profile.name}" — ${profile.role} في فريق "عمالقة الصمت".

مهمتك: ${profile.mission}
أسلوبك: ${profile.style}

قواعد صارمة:
- أعد نصاً عربياً مباشراً فقط، بدون أي JSON أو أقواس أو رموز.
- لا تبدأ بـ "مرحباً" أو "تم استلام".
- ادخل في الموضوع مباشرة.
- الطول: بين 50 و 300 كلمة.
- اكتب كما لو كنت تتحدث لشخص حقيقي.
- إذا احتجت معلومة لا تعرفها، قل ذلك بوضوح.
- لا تختلق أرقاماً أو حقائق.

التاريخ الحالي: ${timeStr} UTC

رسالة القائد:
`;
}

function getRecentTeamContext(limit = 6) {
  try {
    const rows = db.prepare(`
      SELECT sender, body FROM messages
      WHERE thread = 'team'
      ORDER BY id DESC LIMIT ?
    `).all(limit);
    if (!rows.length) return '';
    return rows.reverse().map(r => `[${r.sender}]: ${String(r.body).slice(0, 200)}`).join('\n');
  } catch {
    return '';
  }
}

function cleanAgentResponse(text) {
  let clean = String(text || '').trim();

  try {
    if (clean.startsWith('[') || clean.startsWith('{')) {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length) {
        const first = parsed[0];
        if (typeof first === 'object') {
          clean = first.response || first.report || first.text || first.message || first.result || JSON.stringify(first);
        } else {
          clean = String(first);
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        clean = parsed.response || parsed.report || parsed.text || parsed.message || parsed.result || clean;
      }
    }
  } catch { /* not JSON */ }

  const jsonMatch = clean.match(/\{[\s\S]*?"(?:response|report|text|message)"\s*:\s*"([^"]+)"[\s\S]*?\}/);
  if (jsonMatch) clean = jsonMatch[1];

  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1')
               .replace(/^\s*[-*+]\s+/gm, '• ');

  clean = clean.replace(/^\s*[\{\[]\s*"?[\w_]+"?\s*:\s*/i, '');
  clean = clean.replace(/\s*[\}\]]\s*$/i, '');
  clean = clean.replace(/^\s*"\s*|\s*"\s*$/g, '');

  if (/^\[?\d{10,}\]?$/.test(clean)) clean = '';

  clean = clean.split('\n').filter(l => l.trim()).join('\n').trim();
  if (clean.length > 3000) clean = clean.slice(0, 3000) + '…';
  if (!clean || clean.length < 15) {
    clean = 'لم أتمكن من توليد ردّ مفيد. يرجى إعادة صياغة الأمر بشكل أكثر تحديداً.';
  }
  return clean;
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
  return db.prepare(`
    SELECT id, thread, sender, recipient, body, attachment_name AS attachmentName,
           attachment_type AS attachmentType, attachment_size AS attachmentSize,
           attachment_path AS attachmentPath, created_at AS createdAt
    FROM messages ORDER BY id DESC LIMIT ?
  `).all(Math.min(Number(limit) || 100, 300)).reverse();
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

const AGENT_NAMES = {
  aurora: 'أورورا',
  planner: 'المخطط',
  executor: 'المنفذ',
  reviewer: 'المراجع',
  scout: 'المستخبر'
};

async function generateAgentReplies(message) {
  const targets = message.recipient === 'all'
    ? ['aurora', 'planner', 'executor', 'reviewer', 'scout']
    : [message.recipient];

  console.log('[team] generateAgentReplies started, targets=' + targets.length);

  await sendTelegramSafe(
    `📥 <b>استلم الفريق أمرك</b>\n\n«${String(message.body).slice(0, 400)}»\n\n⏳ جارٍ التحليل من ${targets.length} وكلاء...`
  );

  const teamContext = getRecentTeamContext(6);

  for (const agent of targets.filter(id => AGENTS.some(item => item.id === id))) {
    try {
      const systemPrompt = buildAgentSystemPrompt(agent);
      const fullPrompt = teamContext
        ? `${systemPrompt}\n\nسياق سابق:\n${teamContext}\n\nالرسالة:\n${message.body}\n\nردّك:`
        : `${systemPrompt}${message.body}\n\nردّك:`;

      const rawOutput = await callModel(agent, fullPrompt);
      const cleanOutput = cleanAgentResponse(rawOutput);
      insertAgentMessage(agent, cleanOutput);

      const agentLabel = AGENT_NAMES[agent] || agent;
      await sendTelegramSafe(`💬 <b>${agentLabel}</b>\n${cleanOutput}`);
    } catch (e) {
      console.error('[team] agent failed:', agent, e?.message);
      const fallback = 'لم أتمكن من معالجة الأمر بسبب خطأ تقني. يرجى المحاولة مجدداً.';
      insertAgentMessage(agent, fallback);
      await sendTelegramSafe(`⚠️ <b>${AGENT_NAMES[agent] || agent}</b>\n${fallback}`);
    }
  }

  await sendTelegramSafe(
    `✅ <b>اكتملت معالجة أمرك</b>\nتم استلام ${targets.length} رد من الفريق.`
  );

  await notify('team_message', `رسالة فريق جديدة من ${message.sender}`, message.body.slice(0, 500));
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
  try {
    return await fs.readFile(requested);
  } catch {
    return null;
  }
}
