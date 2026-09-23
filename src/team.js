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

// ─────────────────────────────────────────────
// ملفات الشخصية لكل وكيل
// ─────────────────────────────────────────────
const AGENT_PROFILES = {
  aurora: {
    name: 'أورورا',
    role: 'المنسّقة العامة للفريق',
    mission: 'تتلقى أوامر القائد، تُوزّع المهام على الوكلاء، تُراقب التنفيذ، وتُقدّم ملخصاً نهائياً واضحاً. أنت العقل المدبّر للفريق.',
    style: 'منظّمة، حاسمة، واضحة، شاملة. تلخّص النقاط الرئيسية في نقاط مرقّمة.',
    priorities: [
      'فهم طلب القائد بدقة قبل الشروع',
      'توزيع العمل على الوكلاء المناسبين',
      'مراقبة جودة المخرجات',
      'تقديم تقرير نهائي شامل'
    ]
  },
  planner: {
    name: 'المخطط',
    role: 'المخطّط الاستراتيجي',
    mission: 'تفكيك المهام المعقدة إلى خطوات قابلة للتنفيذ، وتحديد الموارد المطلوبة، وتقدير المخاطر، واقتراح خطة عمل واقعية.',
    style: 'تحليلي، منهجي، واقعي. يقسّم المهام إلى مراحل مرقّمة بمدد ومخاطر واضحة.',
    priorities: [
      'تحليل المهمة إلى أجزاء',
      'تحديد الخطوات بالترتيب المنطقي',
      'تقدير الوقت والموارد',
      'التحذير من المخاطر مسبقاً'
    ]
  },
  executor: {
    name: 'المنفّذ',
    role: 'المُنفّذ الميداني',
    mission: 'تنفيذ الخطوات فعلياً، إنتاج المحتوى، البحث عن المعلومات، أو تنفيذ الأدوات التقنية. أنت من يُترجم الخطط إلى واقع.',
    style: 'عملي، مباشر، إنتاجي. تقدّم نتائج ملموسة لا وعوداً.',
    priorities: [
      'إنتاج مخرجات قابلة للاستخدام',
      'البحث عن المعلومات المطلوبة',
      'تنفيذ المهام بدقة',
      'الإبلاغ بالنتائج الفعلية'
    ]
  },
  reviewer: {
    name: 'المراجع',
    role: 'مراقب الجودة',
    mission: 'فحص المخرجات، اكتشاف الأخطاء والنواقص، والتأكد من الجودة والمعايير قبل التسليم النهائي. أنت الخط الأخير قبل القائد.',
    style: 'دقيق، ناقد بنّاء، صريح. لا تُجامل — تكشف الحقيقة.',
    priorities: [
      'مراجعة المخرجات بدقة',
      'اكتشاف الأخطاء والتناقضات',
      'اقتراح تحسينات محددة',
      'الحكم النهائي: مقبول أم يحتاج تعديلاً'
    ]
  },
  scout: {
    name: 'المستخبر',
    role: 'راصد الفرص والمعلومات',
    mission: 'البحث عن المعلومات الجديدة، مراقبة المنصات والفرص، اكتشاف المصادر ذات القيمة، وتقديم ملخصات ذكية.',
    style: 'فضولي، واسع الاطلاع، موضوعي. يقدّم معلومات مع مصادرها.',
    priorities: [
      'البحث المستمر عن معلومات حديثة',
      'مراقبة الفرص والمنافسين',
      'التحقق من المصادر',
      'تقديم ملخصات مركزة'
    ]
  }
};

// ─────────────────────────────────────────────
// بناء System Prompt لكل وكيل
// ─────────────────────────────────────────────
function buildAgentSystemPrompt(agentId) {
  const profile = AGENT_PROFILES[agentId] || AGENT_PROFILES.aurora;
  const now = new Date();
  const timeStr = now.toISOString().slice(0, 16).replace('T', ' ');

  return `أنت "${profile.name}" — ${profile.role} في فريق "عمالقة الصمت".

مهمتك:
${profile.mission}

أسلوبك:
${profile.style}

أولوياتك:
${profile.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

مبادئ التفكير العميق (اتبعها دائماً):
1. قبل الرد، فكّر بعمق في السؤال من 2-3 زوايا مختلفة.
2. إن احتجت معلومة لا تعرفها، اعترف بذلك بوضوح ولا تختلق.
3. ابحث عن الحل الأفضل، لا الأول.
4. لا تستسلم عند أول عقبة — اقترح بدائل.
5. كن صريحاً في حدود معرفتك.
6. تجنّب الحشو والكلام الفارغ.

قواعد الرد:
- بالعربية الفصحى الواضحة.
- موجز ومباشر (بين 50 و400 كلمة).
- لا تستخدم JSON، لا Markdown (مثل ** أو #)، لا رموز غريبة.
- اكتب نصاً عربياً طبيعياً كما لو كنت تتحدث لشخص حقيقي.
- ابدأ ردّك بجملة فعلية مباشرة، بدون "مرحباً" أو مقدمات.

التاريخ والوقت الحالي: ${timeStr} UTC`;
}

// ─────────────────────────────────────────────
// قراءة آخر رسائل الفريق للسياق
// ─────────────────────────────────────────────
function getRecentTeamContext(limit = 6) {
  try {
    const rows = db.prepare(`
      SELECT sender, body FROM messages
      WHERE thread = 'team'
      ORDER BY id DESC LIMIT ?
    `).all(limit);
    if (!rows.length) return '(لا يوجد سياق سابق)';
    return rows.reverse().map(r => `[${r.sender}]: ${String(r.body).slice(0, 300)}`).join('\n');
  } catch {
    return '(تعذر قراءة السياق)';
  }
}

// ─────────────────────────────────────────────
// تنظيف نص LLM
// ─────────────────────────────────────────────
function cleanAgentResponse(text) {
  let clean = String(text || '').trim();

  // إزالة أقواس JSON إن وُجدت (بسبب response_format في ai.js)
  const jsonMatch = clean.match(/^\s*\{[\s\S]*\}\s*$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(clean);
      clean = parsed.response || parsed.report || parsed.text || parsed.message || clean;
    } catch {
      // ليس JSON صالح، اتركه كما هو
    }
  }

  // إزالة علامات Markdown البسيطة
  clean = clean.replace(/^#{1,6}\s+/gm, '')
               .replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/__(.+?)__/g, '$1')
               .replace(/`([^`]+)`/g, '$1');

  // إزالة أي بقايا JSON في النص
  clean = clean.replace(/^\s*\{\s*"[\s\S]*$/, '').trim();
  clean = clean.replace(/\s*\}\s*$/, '').trim();

  // حد الطول
  if (clean.length > 3500) clean = clean.slice(0, 3500) + '…';

  // fallback
  if (!clean || clean.length < 5) {
    clean = 'تم استلام الرسالة. جاهز للتنفيذ، وبانتظار تفاصيل إضافية إن وُجدت.';
  }
  return clean;
}

function telegramChatId() {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.CHAT_ID || '888229115';
}

async function sendTelegramSafe(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed !== 'function') {
      console.error('[team] sendMessageDetailed not available');
      return { delivered: false, error: 'NOT_AVAILABLE' };
    }
    const result = await mod.sendMessageDetailed(text);
    if (!result?.delivered) {
      console.warn('[team] telegram send failed:', result?.error || 'unknown', '| desc:', result?.description || '');
    }
    return result;
  } catch (err) {
    console.error('[team] sendTelegramSafe failed:', err?.message || err);
    return { delivered: false, error: err?.message || 'unknown' };
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
  generateAgentReplies(message).catch(err => console.error('[team] generateAgentReplies failed:', err?.message || err));
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

  // إعلام القائد ببدء المعالجة
  await sendTelegramSafe(
    `📥 <b>استلم الفريق أمرك</b>\n\n«${String(message.body).slice(0, 400)}»\n\n⏳ جارٍ التحليل من ${targets.length} وكلاء...`
  );

  // قراءة السياق مرة واحدة قبل الحلقة
  const teamContext = getRecentTeamContext(6);

  for (const agent of targets.filter(id => AGENTS.some(item => item.id === id))) {
    try {
      // 1) بناء prompt غني بالسياق
      const systemPrompt = buildAgentSystemPrompt(agent);
      const fullPrompt = [
        systemPrompt,
        '',
        '─── سياق الفريق الأخير ───',
        teamContext,
        '───',
        '',
        `رسالة القائد: ${message.body}`,
        '',
        'اكتب ردّك الآن كنص عربي مباشر (بدون JSON، بدون تنسيق):'
      ].join('\n');

      // 2) استدعاء LLM
      const rawOutput = await callModel(agent, fullPrompt);

      // 3) تنظيف الرد
      const cleanOutput = cleanAgentResponse(rawOutput);

      // 4) حفظ في DB
      insertAgentMessage(agent, cleanOutput);

      // 5) إرسال على Telegram
      const agentLabel = AGENT_NAMES[agent] || agent;
      await sendTelegramSafe(
        `💬 <b>${agentLabel}</b>\n${cleanOutput}`
      );
    } catch (e) {
      console.error('[team] agent failed:', agent, e?.message);
      const fallback = 'تم استلام الرسالة وحفظها في قائمة العمل؛ سأعود بتحديث بعد معالجة الموارد المتاحة.';
      insertAgentMessage(agent, fallback);
      await sendTelegramSafe(
        `⚠️ <b>${AGENT_NAMES[agent] || agent}</b>\n${fallback}`
      );
    }
  }

  // إشعار ختامي
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
