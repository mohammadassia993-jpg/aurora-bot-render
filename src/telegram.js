import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDelegationStatus, delegateTask, requestApproval, decideApproval, getDelegationCommands, getAgentList, getPendingApprovals } from './delegation.js';
import { db } from './db.js';
import { info, warn } from './logger.js';
import { runConnectors } from './connectors.js';
import { modelPerformance, selectModel, callModel } from './ai.js';
import { telegramRequest } from './telegram-api.js';
import { teamEvents } from './team.js';

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), ms))]);
}
import { PRODUCTS, productCatalogue, paymentInfo, orderPromptReply, paymentReceiptReply, ordersSummary } from './storefront.js';
import { createTask, runTaskFlow, getTaskStatus, getTaskReport, isLeaderMessage, matchTaskCommand, matchReportCommand, matchStatusCommand } from './task-flow.js';
import { runBrowserSubmissions } from './superteam-submit.js';

let offset = 0;
let mode = 'disabled';
let pollingBusy = false;
let discoveredChatId = '';
let remoteFailures = 0;
let webhookSyncBusy = false;
const chatIdFile = path.join(config.root, 'data', 'telegram_chat_id');
try { discoveredChatId = fs.readFileSync(chatIdFile, 'utf8').trim(); } catch {}

export function telegramMode() {
  return mode;
}

function effectiveChatId() {
  return config.telegramChatId || discoveredChatId;
}

async function remoteHealthy() {
  if (!config.backupUrl) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${config.backupUrl.replace(/\/$/, '')}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

let outboxBusy = false;

export async function sendMessageDetailed(text, chatId = effectiveChatId(), replyToMessageId = null) {
  if (!config.telegramToken || !chatId) {
    return { delivered: false, error: 'MISSING_TELEGRAM_CONFIG' };
  }
  try {
    const response = await telegramRequest(config.telegramToken, 'sendMessage', {
      chat_id: chatId,
      text,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId, allow_sending_without_reply: true } : {}),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, 15000);
    if (!response.ok || !response.data?.ok) {
      return { delivered: false, error: `HTTP_${response.status}`, description: response.data?.description || '' };
    }
    return { delivered: true, messageId: response.data.result.message_id };
  } catch (caught) {
    warn('telegram', `send failed: ${caught.message}`);
    return { delivered: false, error: caught.message };
  }
}

export async function sendMessage(text) {
  return sendMessageDetailed(text).then(result => result.delivered);
}

export function relayTelegramUpdate(message) {
  if (config.platformRole !== 'primary' || !config.backupUrl || !config.databaseSyncToken || !message?.text) {
    return Promise.resolve({ relayed: false, reason: 'disabled' });
  }
  const payload = {
    text: message.text,
    messageId: message.message_id || Date.now(),
    chatId: String(message.chat?.id || ''),
    sender: message.from?.username ? `telegram:${message.from.username}` : `telegram:${message.chat?.id || 'unknown'}`
  };
  return fetch(`${config.backupUrl.replace(/\/$/, '')}/api/team/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-database-sync-key': config.databaseSyncToken },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  }).then(response => response.json().catch(() => ({}))).then(result => ({ relayed: Boolean(result.ok), result }))
    .catch(error => ({ relayed: false, error: error.message }));
}

export function dailyReport() {
  const tasks = db.prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status").all();
  const fixedErrors = db.prepare("SELECT COUNT(*) AS count FROM errors WHERE resolved = 1 AND date(last_seen) = date('now')").get().count;
  const openErrors = db.prepare("SELECT COUNT(*) AS count FROM errors WHERE resolved = 0 AND last_seen >= datetime('now', '-24 hours')").get().count;
  const rewards = db.prepare("SELECT COALESCE(SUM(reward), 0) AS total FROM tasks WHERE status IN ('delivered','paid')").get().total;
  const approvals = db.prepare("SELECT COUNT(*) AS count FROM approvals WHERE state = 'pending'").get().count;
  const models = modelPerformance().slice(0, 3).map(row => `${row.model}: ${(row.success_rate * 100).toFixed(0)}%`).join('، ') || 'لا يوجد';

  const countBySource = source => db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE source = ?').get(source).count;
  return [
    '<b>التقرير اليومي لأورورا — عمالقة الصمت</b>',
    `البوت: <b>${mode === 'active' ? 'نشط' : 'غير نشط'}</b>`,
    `مسار الوظائف: ${countBySource('jobs')}`,
    `المهام/دي ورك: ${countBySource('dework')}`,
    `تيتان/دي بين: ${countBySource('titan')}`,
    `الجوائز والفرص: ${countBySource('opportunity')}`,
    `جميع الحالات: ${tasks.map(item => `${item.status}=${item.count}`).join('، ') || 'لا يوجد'}`,
    `قيمة المكافآت المؤكدة أو المعلقة: ${rewards}`,
    `الأخطاء التي أُصلحت اليوم: ${fixedErrors}`,
    `الأحداث المفتوحة خلال ٢٤ ساعة: ${openErrors}`,
    `الموافقات المنتظرة: ${approvals}`,
    `النماذج: ${models}`,
    '',
    '🛒 المتجر:',
    ordersSummary()
  ].join('\n');
}

function statusText() {
  const labels = {
    gateway: 'البوابة',
    internet: 'الإنترنت',
    telegram: 'تلغرام',
    ai: 'الذكاء الاصطناعي',
    memory: 'الذاكرة',
    disk: 'التخزين'
  };
  const latest = {};
  for (const row of db.prepare(`
    SELECT component, healthy, detail, created_at FROM health_checks
    WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
  `).all()) latest[row.component] = row;

  const lastSent = db.prepare(`
    SELECT telegram_message_id, created_at FROM telegram_outgoing
    WHERE status='sent' ORDER BY id DESC LIMIT 1
  `).get();
  const delivery = lastSent ? `\nآخر رد مؤكد: ${lastSent.telegram_message_id} (${lastSent.created_at})` : '\nلا يوجد رد مؤكد بعد.';
  return Object.entries(latest).map(([name, item]) => `${labels[name] || name}: ${item.healthy ? '✅' : '❌'} ${item.detail}`).join('\n') + delivery;
}

const replyRotation = new Map();

function pickVariant(variants, key = 'default') {
  const last = replyRotation.get(key);
  const pool = variants.filter(variant => variant !== last);
  const chosen = pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : variants[Math.floor(Math.random() * variants.length)];
  replyRotation.set(key, chosen);
  return chosen;
}

function localChatFallback(value, lower, address, isLeader, sender, healthyCount, totalCount, failing, taskText, pendingApprovals, issueLine, priorContext) {
  const weakLabel = failing.map(row => labelsFromRows(row.component) || row.component).join('، ');
  const weakNote = weakLabel ? ` وأعمل الآن على معالجة: ${weakLabel}` : '';
  const live = `${healthyCount}/${totalCount} مكونات سليمة${weakNote}`;
  const name = isLeader ? 'محمد' : (sender?.username || 'صديقي');
  const topic = value.slice(0, 60);
  const lastLine = priorContext ? String(priorContext).split(' | ').pop() : '';
  const lastUserLine = lastLine ? lastLine.replace(/^telegram:[^:]*:\s*/,'') : '';
  const ctx = lastUserLine ? `\nولاحظتُ حديثنا السابق عن «${lastUserLine.slice(0, 50)}»؛ هل نتابعه معاً؟` : '';
  const key = `chat:${sender?.id || sender?.username || 'anon'}`;

  if (/^(مرحبا|مرحباً|السلام|اهلا|أهلا|هاي|هلا|صباح الخير|مساء الخير|hello|hi|hey)/i.test(lower)) {
    return pickVariant([
      `أهلاً بك يا ${name} 👋 تسعدني رسالتك، وأنا جاهزة لأي طلب أو سؤال.`,
      `مرحباً ${name} 🌟 بخير والحمد لله، والفريق يعمل بجد. كيف يمكنني خدمتك اليوم؟`,
      `أهلاً وسهلاً يا ${name} 🤝 أنا معك على مدار الساعة؛ حدثني ماذا تريد أن ننجز؟`,
      `نورتنا يا ${name} ✨ أنا أورورا، منسقة الفريق، وتحت أمرك.`
    ], `${key}:greet`) + ctx;
  }

  if (/(كيف حالك|كيفك|كيف الحال|كيف الاحوال|شلونك|عامل ايه)/i.test(lower)) {
    return pickVariant([
      'أنا بخير والحمد لله 🌹 أيقظتني رسالتك وأنا في كامل تركيزي لخدمتك. وكيف أنت؟',
      'الحمد لله، بخير وعلى أتم الاستعداد 💪 أخبرني كيف أكون مطمئنة لك اليوم.',
      `بخير يا ${name}، والنظام يعمل والفريق منسق 🤍 شكراً لسؤالك، هذا يعني لي الكثير.`
    ], `${key}:smalltalk`);
  }

  if (/(من انت|من أنت|من تكون|عرفني بنفسك|ما اسمك|وش اسمك|who are you|what.s your name)/i.test(lower)) {
    return 'أنا أورورا 🌟 منسقة فريق «عمالقة الصمت»: أتابع النظام، أنسّق بين المخطط والمنفذ والمراجع والمستخبر، وأسهر على تنفيذ أوامرك بدقة واحترافية.';
  }

  if (/(شكرا|شكراً|تسلم|يعطيك العافية|جزاك الله|ممتاز|تمام|رائع)/i.test(lower)) {
    return pickVariant([
      `العفو يا ${name} 🌹 هذا واجبنا، وإن كان لك طلب آخر فسأكون سعيدة بتنفيذه.`,
      'الشكر لك على ثقتك، وأنا هنا دائماً 🙏 أعدك بالمتابعة حتى النهاية.',
      'جميل جداً! تسعدني رضاك 😊 هل هناك ما نضيفه على هذا الإنجاز؟'
    ], `${key}:thanks`);
  }

  if (/(لا يرد|لا يعمل|معطل|عطل|بطيء|متجمد|لا يستجيب|مشكلة|شكوى|خطأ)/i.test(lower)) {
    return pickVariant([
      `آسفة يا ${name} على هذا الشعور 🌧️ دعني أفحص النظام الآن جذرياً، وسأعود إليك بحالة حقيقية لا مجرد طمأنة.`,
      'أتفهم انزعاجك تماماً، وهذا ليس مستوى خدمتنا 🌹 سأشخّص السبب وأصلحه فوراً وأبلغك بالنتيجة الفعلية.',
      'لماذا لا تسمح لي بأن أتولى التشخيص الآن؟ أرسل /status وسأقرأ الوضع بنفسي، ثم أعطيك تشخيصاً دقيقاً.'
    ], `${key}:complaint`);
  }

  if (/(حالة|الوضع|كيف النظام|وضع البوت|status)/i.test(lower)) {
    return pickVariant([
      `دعني أفحص الوضع لك الآن… 🔍 ${live}.`,
      `هذه صورتك المباشرة: ${live}. إن أردت تفاصيل أعمق أرسل /status.`
    ], `${key}:status`) + ctx;
  }

  if (/(تقرير|التقرير|report|أداء|اداء)/i.test(lower)) {
    return pickVariant([
      `حاضر، أجهّز لك الملخص الآن… ${taskText || 'لا مهام مسجلة بعد'}. التقرير الكامل جاهز بكلمة /report.`,
      `دعني ألخص لك الوضع 📋 ${taskText || 'لا مهام مسجلة بعد'}. أرسل /report لاستلام التقرير الكامل مع الأرقام.`
    ], `${key}:report`);
  }

  if (/(مهمة|مهام|عمل|وظيفة|وظائف|job|task|dework|titan|دي ورك|تيتان)/i.test(lower)) {
    return pickVariant([
      `وضع المهام الآن: ${taskText || 'لا مهام مسجلة بعد'}. الفريق يعمل عليها، وأي تسليم نهائي بانتظار موافقتك أولاً 🤝`,
      `فهمت سؤالك عن المهام 🌾 حالياً ${taskText || 'لا مهام مسجلة بعد'}. أرسل /sync لتحديث المسارات فوراً.`
    ], `${key}:tasks`);
  }

  if (/(مال|فلوس|ربح|دخل|دفع|سحب|استلام|استلم|أستلم|قبض|تحويل|usdt|usdc|ايراد|إيراد)/i.test(lower)) {
    return pickVariant([
      'بالنسبة للعوائد 💰 سياستنا ثابتة: عناوين استلام فقط، ولا سحب بأي حال من الأحوال، وأي تسليم أو تعاقد يمر بموافقتك المسبقة.',
      'أفهم اهتمامك بالأرباح، وأؤكد لك الشفافية: نقبل المدفوعات على عناوين الاستلام، ولا ننفذ أي تحويل خارجي، وكل قرار مالي بانتظار قرارك.'
    ], `${key}:money`);
  }

  if (/(نفذ|افعل|ابدأ|شغل|شغّل|ارسل|أرسل|انجز|أنجز|المطلوب|يرجى|قيام|حقق)/i.test(lower)) {
    return pickVariant([
      'مفهوم ✅ بدأت التنفيذ الآن وسأعود إليك بنتيجة فعلية لا مجرد تأكيد.',
      `حاضر يا ${name} 🚀 أطلقت العمل على «${topic}» وسأتابعه خطوة بخطوة حتى التسليم.`
    ], `${key}:order`);
  }

  if (/(مع السلامة|باي|وداعا|وداعاً|تصبح على خير|goodbye|bye)/i.test(lower)) {
    return pickVariant([
      'في أمان الله يا محمد 🤍 أنا هنا متى احتجتني.',
      'إلى اللقاء! سأبقى في الخدمة وأنا بانتظار عودتك 🌙'
    ], `${key}:bye`);
  }

  return pickVariant([
    `فهمت رسالتك يا ${name}: «${topic}» ✍️ سأنقلها للوكيل الأنسب وأتابعها بجدية، ثم أعود إليك بنتيجة واضحة.`,
    `وصلتني «${topic}» بوضوح ✅ دعني أجهّز المعالجة المناسبة لها، وإن وُجدت تفاصيل إضافية شاركها معي.`,
    `سجّلت طلبك: «${topic}» 📌 سأعمل عليه الآن وأبقيك على اطّلاع بسير العمل.`
  ], `${key}:default`) + ctx;
}

function labelsFromRows(component) {
  const map = { gateway: 'البوابة', internet: 'الإنترنت', telegram: 'تلغرام', ai: 'الذكاء', memory: 'الذاكرة', disk: 'التخزين' };
  return map[component] || component;
}

export async function contextualReply(text, sender = {}) {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  const isLeader = String(sender.id || '') === effectiveChatId() ||
    String(sender.username || '').toLowerCase() === 'mohammadabbas891';
  const address = isLeader ? 'أهلاً بك يا محمد عباس' : 'أهلاً بك';
  const rows = db.prepare(`
    SELECT component, healthy, detail FROM health_checks
    WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
  `).all();
  const labels = { gateway: 'البوابة', internet: 'الإنترنت', telegram: 'تلغرام', ai: 'الذكاء', memory: 'الذاكرة', disk: 'التخزين' };
  const failing = rows.filter(row => !row.healthy);
  const healthyCount = rows.length - failing.length;
  const issueLine = failing.length ? `الملاحظة الآنية: ${failing.map(row => labels[row.component] || row.component).join('، ')}.\n` : '\n';
  const taskRows = db.prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status").all();
  const taskText = taskRows.map(row => `${row.status}=${row.count}`).join('، ') || 'لا مهام';
  const pendingApprovals = db.prepare("SELECT COUNT(*) AS count FROM approvals WHERE state='pending'").get().count;
  const history = db.prepare(`
    SELECT sender, body FROM messages
    WHERE thread='telegram'
    ORDER BY id DESC LIMIT 8
  `).all().reverse();
  const priorContext = history.slice(0, -1).slice(-3)
    .map(row => `${row.sender}: ${row.body}`).join(' | ');

  // Storefront payment receipt handling
  const receiptReply = paymentReceiptReply(value, sender);
  if (receiptReply) return receiptReply;

  // Storefront order intent handling
  const orderReply = orderPromptReply(value, sender);
  if (orderReply) return orderReply;
  if (/cat|catalogue|المنتجات|متجر|اسعار|الأسعار|كام سعر/i.test(lower) && !/socket|بيت/i.test(lower)) {
    return ['🛒 منتجاتنا الجاهزة للطلب الفوري:', productCatalogue(), '', paymentInfo(), '', 'اكتب: «اشتري <رقم>» لإتمام الطلب.'].join('\n');
  }
  // Direct storefront intent handlers (deterministic, before AI)
  if (/سعر|ثمن|كم.*منتج|منتج|شراء|اشتري|buy|price|products|المتجر|متجر/i.test(lower)) {
    return ['🛒 منتجاتنا:', productCatalogue(), '', paymentInfo(), '', 'اكتب: «اشتري <رقم>» لإتمام الطلب فوراً.'].join('\n');
  }
  if (/تأكيد|اكّد|اكد|confirmed|order.*تم|متى يصلك|طلب وجد/i.test(lower)) {
    return '📦 تأكيد الطلب:\n\n1️⃣ اختر المنتج بـ «اشتري <رقم>».\n2️⃣ ادفع المبلغ للمحفظة المذكورة (USDT/USDC).\n3️⃣ أرسل إيصال التحويل (TXID) هنا.\n4️⃣ بعد التحقق نسلمك الملف خلال ساعة.\n\nهل تريد تأكيد طلبك الآن؟';
  }
  if (/مشكلة|شكوى|عطل|خطأ|لا يعمل|بطيء|بطئ|لا يشتغل|problem|issue|slow|broken/i.test(lower)) {
    return 'آسف على الإزعاج 🙏 دعنا نحل الأمر معاً.\n\n• إن كانت المشكلة في البوت: جرّب /status لفحص الحالة.\n• إن كانت في منتج/طلب: أرسل رقم الطلب أو المنتج وسأتابع معك فوراً.\n• إن كانت تقنية عامة: صف لي ما يحدث خطوة بخطوة.\n\nأنا هنا لمساعدتك حتى نصل لحل.';
  }

  // Task flow: handle leader task commands
  if (isLeaderMessage(sender)) {
    const taskTitle = matchTaskCommand(value);
    if (taskTitle) {
      const taskId = createTask(taskTitle, 'leader');
      // Execute in background
      runTaskFlow(taskId).then(results => {
        const summary = [
          `✅ تم تسليم المهمة #${taskId}: "${taskTitle}"`,
          '',
          '📋 ملخص التنفيذ:',
          results.planner ? `• المخطط: ${String(results.planner).slice(0, 300)}` : '',
          results.executor ? `• المنفذ: ${String(results.executor).slice(0, 300)}` : '',
          results.reviewer ? `• المراجع: ${String(results.reviewer).slice(0, 300)}` : '',
          '',
          '📊 المهمة مكتملة.'
        ].filter(Boolean).join('\n');
        sendMessageDetailed(summary, effectiveChatId());
      }).catch(err => {
        sendMessageDetailed(`❌ خطأ في المهمة #${taskId}: ${err.message}`, effectiveChatId());
      });
      return `✅ تم استلام المهمة: "${taskTitle}"\n\n🔄 جارٍ تنفيذ التدفق الكامل:\n1. 📋 المخطط يحلل...\n2. ⚙️ المنفذ ينفّذ...\n3. 🔍 المراجع يراجع...\n\n⏳ سأبلغك فور الانتهاء.`;
    }
    if (matchReportCommand(value)) {
      return getTaskReport();
    }
    if (matchStatusCommand(value)) {
      return statusText();
    }
  }

  // Always use the intelligent AI engine for ALL messages
  if (process.env.AI_CHAT_LOCAL_ONLY !== '1') try {
    const prompt = [
      'أنت أورورا، منسقة فريق عمالقة الصمت. أجب بالعربية الفصحى الواضحة والطبيعية.',
      ` القائد هو: ${isLeader ? 'محمد عباس (قائد الفريق)' : 'عضو في الفريق'}.`,
      'استخدم السياق والحالة الفعلية وقدم خطوة تالية مفيدة.',
      'لا تستخدم Markdown أو HTML، ولا تدّعِ بيانات غير موجودة.',
      `الحالة: سليم ${healthyCount}/${rows.length}. المهام: ${taskText}. الموافقات: ${pendingApprovals}.`,
      priorContext ? `السياق الأخير: ${priorContext.slice(0, 240)}.` : '',
      `رسالة القائد: ${value}`
    ].filter(Boolean).join('\n');
    const generated = await withTimeout(callModel('aurora', prompt), 8000).catch(caught => { warn('timed.ai', caught.message); return ''; });
    const clean = String(generated || '').replace(/<[^>]*>/g, '').replace(/[&<>]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]).trim();
    if (clean && !/\[aurora\]|\[executor\]|\[planner\]|\[reviewer\]|\[scout\]|local draft|Status: deterministic|المحاكاة الذكية|مسودة المحاكاة|خطة المحاكاة|نتيجة المراجعة بالمحاكاة|قرار التنسيق بالمحاكاة|لا تتوفر مصادر خارجية/.test(clean)) return clean;
  } catch {}

  // Final fallback: natural conversational Arabic (diverse, human-like)
  return localChatFallback(value, lower, address, isLeader, sender, healthyCount, rows.length, failing, taskText, pendingApprovals, issueLine, priorContext);
}

function enqueueReply(updateId, chatId, text, replyToMessageId = null) {
  if (!chatId) return null;
  const storedMessageId = db.prepare('SELECT message_id FROM telegram_updates WHERE update_id = ?')
    .get(updateId)?.message_id || null;
  const row = db.prepare(`
    INSERT INTO telegram_outgoing(update_id, chat_id, text, reply_to_message_id)
    VALUES (?, ?, ?, ?)
  `).run(updateId, String(chatId), String(text).slice(0, 4000), replyToMessageId || storedMessageId);
  return Number(row.lastInsertRowid);
}


// Background contextual reply: replies instantly with an ack, then generates the
// smart Arabic reply asynchronously so a slow local-LLM never blocks the polling loop.
async function asyncContextualReply(updateId, chatId, text, sender) {
  try {
    const reply = await contextualReply(text, sender);
    if (reply) {
      // أرسل مباشرة عبر Telegram بدلاً من الطابور (لضمان الوصول الفوري)
      await sendMessageDetailed(reply, chatId);
    }
  } catch (caught) {
    warn('telegram', `background reply failed: ${caught.message}`);
  }
}

export async function handleTelegramUpdate(update) {
  const chatId = String(update.message?.chat?.id || update.edited_message?.chat?.id || update.callback_query?.message?.chat?.id || '');
  if (update.update_id) {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO telegram_updates(update_id, chat_id, message_id, payload_json)
      VALUES (?, ?, ?, ?)
    `).run(
      update.update_id,
      String(update.message?.chat?.id || update.edited_message?.chat?.id || update.callback_query?.message?.chat?.id || ''),
      update.message?.message_id || 0,
      JSON.stringify(update).slice(0, 20000)
    );
    if (!inserted.changes) return false;
    info('telegram', `update accepted once: update_id=${update.update_id} chat_id=${chatId || 'unknown'} message_id=${update.message?.message_id || 0}`);
  }
  if (!config.telegramChatId && chatId && chatId !== discoveredChatId) {
    discoveredChatId = chatId;
    fs.writeFileSync(chatIdFile, chatId, { mode: 0o600 });
  }
  if (update.message?.text) {
    db.prepare("INSERT INTO messages(thread,sender,recipient,body) VALUES ('telegram',?,'team',?)")
      .run(update.message.from?.username ? `telegram:${update.message.from.username}` : `telegram:${chatId}`, update.message.text.slice(0, 20000));
    teamEvents.emit('message', { type: 'telegram-primary', chatId });
    db.prepare('INSERT INTO notifications(kind,title,body) VALUES (?,?,?)')
      .run('telegram_message', 'رسالة Telegram جديدة', update.message.text.slice(0, 800));
    relayTelegramUpdate(update.message).then(result => {
      if (!result.relayed && result.reason !== 'disabled') warn('telegram', `interface relay failed: ${result.error || 'unknown'}`);
    });
  }
  if (update.message?.text && !update.message.text.startsWith('/')) {
    asyncContextualReply(update.update_id, chatId, update.message.text, update.message.from || {});
  }
  if (update.message) await handleCommand(update.message);
  if (update.update_id) {
    db.prepare("UPDATE telegram_updates SET status='processed', processed_at=CURRENT_TIMESTAMP WHERE update_id=?")
      .run(update.update_id);
    info('telegram', `update processed once: update_id=${update.update_id} message_id=${update.message?.message_id || 0}`);
  }
  return true;
}

async function handleCommand(message) {
  const command = message.text?.split(/\s+/)[0].replace(/@.*$/, '') || '';
  const replyChatId = effectiveChatId() || message.chat.id;
  if (command === '/start') {
    enqueueReply(null, replyChatId, ['مرحباً بك في متجر عمالقة الصمت! 🛒', '', 'منتجات رقمية احترافية بالعربية (Web3):', '📖 قاموس Web3 — 15$', '🎓 دورة DePIN — 25$', '✍️ حزمة كتابة — 35$', '🔐 شرح عقد ذكي — 20$', '🗂️ حزمة وظائف — 30$', '📊 تحليل أمن — 40$', '', 'للشراء: اكتب «اشتري <رقم>»', 'لرؤية كل المنتجات: /products', 'لطرق الدفع: /shop', '', 'الدفع: USDT/USDC — تسليم خلال ساعة ✓'].join('\n'));
  } else if (command === '/help') {
    enqueueReply(null, replyChatId, ['الأوامر المتاحة:', '/start — ترحيب المتجر', '/products — منتجات المتجر', '/shop — دليل الشراء', '/orders — حالة الطلبات', '/status — حالة النظام', '/report — التقرير اليومي', '/tasks — تقرير المهام\n/submit — التقديم على Superteam Earn', '/task <عنوان> — تنفيذ مهمة جديدة', '/sync — تحديث المسارات', '/approve رقم yes|no — الموافقات (للقائد)'].join('\n'));
  } else if (command === '/status') {
    enqueueReply(null, replyChatId, statusText());
  } else if (command === '/report') {
    enqueueReply(null, replyChatId, dailyReport());
  } else if (command === '/sync') {
    const result = await runConnectors();
    enqueueReply(null, replyChatId, ['تم تحديث المسارات:', `دي ورك: ${result.dework ? 'تم' : 'متوقف'}`, `تيتان: ${result.titan ? 'تم' : 'متوقف'}`, `الوظائف: ${result.jobs ? 'تم' : 'متوقف'}`, `الفرص: ${result.opportunities ? 'تم' : 'متوقف'}`].join('\n'));
  } else if (command.startsWith('/approve ')) {
    const parts = message.text.split(/\s+/);
    const approvalId = Number(parts[1]);
    const decision = parts[2];
    if (!approvalId || !decision) {
      enqueueReply(null, replyChatId, 'الاستخدام: /approve <رقم> yes|no');
    } else {
      const result = decideApproval(approvalId, decision === 'yes');
      if (result.error) {
        enqueueReply(null, replyChatId, '❌ ' + result.error);
      } else {
        enqueueReply(null, replyChatId, `قرار الموافقة رقم ${approvalId}: ${decision === 'yes' ? '✅ مقبول' : '❌ مرفوض'}.`);
      }
    }
  } else if (command === '/delegation' || command === '/team') {
    enqueueReply(null, replyChatId, getDelegationStatus());
  } else if (command === '/agents') {
    enqueueReply(null, replyChatId, getAgentList());
  } else if (command === '/pending') {
    const pending = getPendingApprovals();
    if (pending.length === 0) {
      enqueueReply(null, replyChatId, '✅ لا توجد巴巴بات بانتظار الموافقة.');
    } else {
      const list = pending.map(a => `#${a.id} [${a.kind}] ${a.title || 'مهمة'}\n  أرسل: /approve ${a.id} yes أو no`).join('\n');
      enqueueReply(null, replyChatId, '巴巴بات بانتظار موافقة القائد:\n' + list);
    }
  } else if (command === '/products' || command === '/store' || command === '/market' || command === '/shop' || command === '/buy') {
    enqueueReply(null, replyChatId, ['🛒 منتجاتنا الجاهزة للطلب الفوري:', productCatalogue(), '', paymentInfo(), '', 'اكتب: «اشتري <رقم>» لإتمام الطلب.'].join('\n'));
  } else if (command === '/orders' || command === '/sales') {
    enqueueReply(null, replyChatId, '📦 حالة الطلبات:\n' + ordersSummary());  } else if (command === '/submit') {
    enqueueReply(null, replyChatId, '🚀 جارٍ بدء التقديم على Superteam عبر المتصفح...\n⏳ قد يستغرق هذا بضع دقائق.\nسأبلغك بالنتيجة فور الانتهاء.');
    runBrowserSubmissions().then(result => {
      if (result.error) {
        sendMessageDetailed('❌ خطأ في التقديم: ' + result.error, effectiveChatId());
      } else {
        const summary = result.output.slice(-2000) || 'لا يوجد مخرجات';
        const status = result.code === 0 ? '✅' : '⚠️';
        sendMessageDetailed(status + ' انتهى التقديم (كود: ' + result.code + ')\n\n' + summary, effectiveChatId());
      }
    }).catch(err => {
      sendMessageDetailed('❌ خطأ غير متوقع: ' + err.message, effectiveChatId());
    });
  } else if (command === '/tasks' || command === '/مهام') {
    enqueueReply(null, replyChatId, getTaskReport());
  } else if (command.startsWith('/task ')) {
    const taskTitle = message.text.slice(6).trim();
    if (!taskTitle) {
      enqueueReply(null, replyChatId, 'الاستخدام: /task <عنوان المهمة>');
    } else {
      const taskId = createTask(taskTitle, 'leader');
      enqueueReply(null, replyChatId, `✅ تم استلام المهمة #${taskId}: "${taskTitle}"\n\n🔄 جارٍ تنفيذ التدفق الكامل:\n1. 📋 المخطط يحلل المهمة...\n2. ⚙️ المنفذ ينفّذ...\n3. 🔍 المراجع يراجع الجودة...\n\n⏳ سأبلغك بالنتيجة فور الانتهاء.`);
      // Execute task flow in background
      runTaskFlow(taskId).then(results => {
        const summary = [
          `✅ تم تسليم المهمة #${taskId}: "${taskTitle}"`,
          '',
          '📋 خطوات التنفيذ:',
          results.planner ? `• المخطط: ${String(results.planner).slice(0, 200)}` : '',
          results.executor ? `• المنفذ: ${String(results.executor).slice(0, 200)}` : '',
          results.reviewer ? `• المراجع: ${String(results.reviewer).slice(0, 200)}` : '',
          '',
          '📊 المهمة مكتملة وجاهزة للمراجعة.'
        ].filter(Boolean).join('\n');
        sendMessageDetailed(summary, effectiveChatId());
      }).catch(err => {
        sendMessageDetailed(`❌ خطأ في المهمة #${taskId}: ${err.message}`, effectiveChatId());
      });
    }
  } else if (command.startsWith('/delegate ')) {
    const parts = message.text.split(/\s+/);
    const agentName = parts[1];
    const taskTitle = parts.slice(2).join(' ');
    if (!agentName || !taskTitle) {
      enqueueReply(null, replyChatId, 'الاستخدام: /delegate <وكيل> <مهمة>\nالوكلاء: aurora, planner, executor, reviewer, scout');
    } else {
      const result = delegateTask(agentName, taskTitle);
      if (result.error) {
        enqueueReply(null, replyChatId, '❌ ' + result.error);
      } else {
        enqueueReply(null, replyChatId, `✅ تم تفويض المهمة لـ ${result.agent}\nرقم المهمة: #${result.taskId}\nالأولوية: ${result.priority}`);
      }
    }
  }
}

export async function processTelegramOutbox() {
  if (outboxBusy) return { processed: 0, skipped: true };
  outboxBusy = true;
  const queued = db.prepare(`
    SELECT * FROM telegram_outgoing
    WHERE status IN ('queued','failed')
    ORDER BY id LIMIT 10
  `).all();
  for (const item of queued) {
    const result = await sendMessageDetailed(item.text, item.chat_id, item.reply_to_message_id);
    if (result.delivered) {
      db.prepare(`
        UPDATE telegram_outgoing
        SET status='sent', attempts=attempts+1, telegram_message_id=?, last_error='', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(result.messageId, item.id);
    } else {
      db.prepare(`
        UPDATE telegram_outgoing
        SET status='failed', attempts=attempts+1, last_error=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(result.error || 'UNKNOWN', item.id);
    }
  }
  outboxBusy = false;
  return { processed: queued.length };
}

export async function syncTelegramWebhook() {
  if (!config.telegramToken || !config.telegramWebhookSecret || config.platformRole !== 'primary' || config.telegramWebhookSyncDisabled || webhookSyncBusy) return { skipped: true };
  webhookSyncBusy = true;
  try {
    const tunnel = JSON.parse(fs.readFileSync(path.join(config.root, 'data', 'tunnel.json'), 'utf8'));
    if (!tunnel.url) return { skipped: true };
    if (tunnel.expiresInHours && tunnel.updatedAt) {
      const age = (Date.now() - new Date(tunnel.updatedAt).getTime()) / 3600000;
      if (age > tunnel.expiresInHours) return { skipped: true, reason: 'tunnel expired' };
    }
    const expectedUrl = `${String(tunnel.url).replace(/\/$/, '')}/telegram/webhook`;
    const current = await telegramRequest(config.telegramToken, 'getWebhookInfo', null, 8000);
    const currentUrl = current.data?.result?.url || '';
    if (currentUrl === expectedUrl) return { synced: true, url: expectedUrl };
    const updated = await telegramRequest(config.telegramToken, 'setWebhook', {
      url: expectedUrl,
      secret_token: config.telegramWebhookSecret,
      allowed_updates: ['message'],
      max_connections: 40
    }, 10000);
    if (!updated.ok || !updated.data?.ok) throw new Error(updated.data?.description || `HTTP_${updated.status}`);
    info('telegram', `webhook synchronized: ${expectedUrl}`);
    return { synced: true, previous: currentUrl, url: expectedUrl };
  } catch (caught) {
    warn('telegram', `webhook sync failed: ${caught.message}`);
    return { synced: false, error: caught.message };
  } finally {
    webhookSyncBusy = false;
  }
}

export async function pollTelegramOnce() {
  if (!config.telegramToken || mode !== 'active') return;
  try {
    const highest = db.prepare('SELECT MAX(update_id) AS value FROM telegram_updates').get().value || 0;
    offset = Math.max(offset, highest + 1);
    const response = await telegramRequest(config.telegramToken, `getUpdates?timeout=1&offset=${offset}`, null, 12000);
    if (!response.ok) {
      if (response.status === 409) {
        warn('telegram', 'polling conflict with an active webhook; clearing webhook and retrying');
        await telegramRequest(config.telegramToken, 'deleteWebhook', null, 8000).catch(() => null);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    for (const update of response.data?.result || []) {
      await handleTelegramUpdate(update);
      await processTelegramOutbox();
      offset = Math.max(offset, update.update_id + 1);
    }
  } catch (caught) {
    warn('telegram', `poll failed: ${caught.message}`);
  } finally {
    pollingBusy = false;
  }
}

async function activateLocalPolling() {
  if (mode === 'active' || mode === 'webhook') return;
  mode = 'active';
  info('telegram', 'local polling activated');
  const pollLoop = async () => {
    if (!pollingBusy) {
      pollingBusy = true;
      try {
        await pollTelegramOnce();
      } finally {
        pollingBusy = false;
      }
    }
    setTimeout(pollLoop, 2000).unref();
  };
  // شبكة أمان: فرّغ الطابور دورياً حتى لا يعلق أي رد تفصيلي قيد الإرسال
  const outboxLoop = async () => {
    try { await processTelegramOutbox(); } catch {}
    setTimeout(outboxLoop, 3000).unref();
  };
  setTimeout(pollLoop, 250).unref();
  setTimeout(outboxLoop, 1000).unref();
}

export async function startTelegram() {
  if (!config.telegramToken) {
    mode = 'disabled';
    info('telegram', 'disabled; no token configured');
    return;
  }

  await syncTelegramWebhook();
  setInterval(() => syncTelegramWebhook().catch(() => {}), 60_000).unref();

  // Always use polling mode
  info('telegram', 'using polling mode');
  if (config.telegramFailover && config.backupUrl && await remoteHealthy()) {
    mode = 'armed';
    info('telegram', 'token installed; local listener armed while Render backup is healthy');
    setInterval(async () => {
      if (mode !== 'armed') return;
      const healthy = await remoteHealthy();
      remoteFailures = healthy ? 0 : remoteFailures + 1;
      if (remoteFailures >= 3) {
        info('telegram', `backup unavailable for ${remoteFailures} consecutive checks; activating local listener`);
        await activateLocalPolling();
      }
    }, 30_000).unref();
    return;
  }

  await activateLocalPolling();
}
