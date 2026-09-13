import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDelegationStatus, delegateTask, requestApproval, decideApproval, getDelegationCommands, getAgentList, getPendingApprovals, revokeAgentToken, getAgentDCTInfo, attenuateAgentToken, isDelegationReady } from './delegation.js';
import { runFullWorkflow, getWorkflowStatus } from './workflow.js';
import { getSubmissionStats, getOpsStatus, runTaskSubmissions, sendDailyOpsReport, runMarketingPublish, sendFollowups, getPlatformPolicy } from './operations.js';
import { getPendingProducts, decideProductApproval, publishApprovedProduct, createProduct, autoProduce, buildCatalogFromTasks, buildProductionReport, getProductionStatus, runMarketAnalysis } from './production.js';
import { submitAllOpportunities, applicationStatus, getAllOpportunities } from './job-applicant.js';
import { generateDailyReport, getCommandCenterStatus, sendAlerts, getKeyMetrics } from './command-center.js';
import { formatMemoryReport, getAgentContextWindow } from './memory.js';
import { listAllAgents } from './agent-config.js';
import { getExecutorToolset } from './executor-tools.js';
import { db } from './db.js';
import { info, warn } from './logger.js';
import { runConnectors } from './connectors.js';
import { modelPerformance, selectModel, callModel } from './ai.js';
import { telegramRequest } from './telegram-api.js';
import { teamEvents } from './team.js';

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), ms))]);
}
import { PRODUCTS, productCatalogue, paymentInfo, orderPromptReply, paymentReceiptReply, ordersSummary, sendInvoiceArgs, handleSuccessfulPayment, subscriptionInfo, SUBSCRIPTION } from './storefront.js';
import { createTask, runTaskFlow, getTaskStatus, getTaskReport, isLeaderMessage, matchTaskCommand, matchReportCommand, matchStatusCommand } from './task-flow.js';
import { runBrowserSubmissions } from './superteam-submit.js';
import { processNaturalMessage } from './natural-assistant.js';
import { telegramRateLimit, detectAnomaly } from './security.js';
import { buildSecurityReport, getIncidentResponsePlan, auditWalletSecurity, encryptData, decryptData } from './security.js';

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

// Escape literal < > & so Telegram HTML parsing never rejects replies that
// contain placeholder text like «اشتري <رقم>», while keeping our intentional
// <b>bold</b> tags intact.
function htmlSafeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;b&gt;/g, '<b>');
}

export async function sendMessageDetailed(text, chatId = effectiveChatId(), replyToMessageId = null) {
  if (!config.telegramToken || !chatId) {
    return { delivered: false, error: 'MISSING_TELEGRAM_CONFIG' };
  }
  try {
    const response = await telegramRequest(config.telegramToken, 'sendMessage', {
      chat_id: chatId,
      text: htmlSafeText(text),
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId, allow_sending_without_reply: true } : {}),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, 15000);
    if (!response.ok || !response.data?.ok) {
      return { delivered: false, error: `HTTP_${response.status}`, description: response.data?.description || '' };
    }
    return { delivered: true, messageId: response.data.result.message_id };
  } catch (caught) {
    warn('telegram', `send FAILED (${chatId}): ${caught.message} text=${String(text).slice(0,50)}`);
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
    const generated = await withTimeout(callModel('aurora', prompt), 30000).catch(caught => { warn('timed.ai', caught.message); return ''; });
    const clean = String(generated || '').replace(/<[^>]*>/g, '').replace(/[&<>]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]).trim();
    if (clean && !/\[aurora\]|\[executor\]|\[planner\]|\[reviewer\]|\[scout\]|local draft|Status: deterministic|المحاكاة الذكية|مسودة المحاكاة|خطة المحاكاة|نتيجة المراجعة بالمحاكاة|قرار التنسيق بالمحاكاة|لا تتوفر مصادر خارجية/.test(clean)) return clean;
  } catch {}

  // Final fallback: natural conversational Arabic (diverse, human-like)
  const naturalFallback = pickVariant([
    `عذراً يا ${name}، لم أتمكن من فهم طلبك بدقة. جرّب أن تكتب رسالتك بشكل أوضح، أو استخدم الأوامر: /status للحالة، /task لإنشاء مهمة، /products لرؤية المنتجات.`,
    `لم أفهم تماماً ما تريد يا ${name} 🤔 هل تقصد一个问题 تقنية، أم طلباً على المتجر، أم حكماً على النظام؟ أخبرني وسأساعدك فوراً.`,
    `أعتذر، يبدو أن رسالتك وصلتني بشكل غير واضح يا ${name} ✍️ يمكنك إعادة صياغتها أو استخدام /help لرؤية الأوامر المتاحة.`
  ], `${key}:confused`);
  return naturalFallback + ctx;
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
    info('telegram', `async-reply: processing text=${String(text).slice(0,40)} chat=${chatId}`);
    const reply = await processNaturalMessage(text, sender);
    info('telegram', `async-reply: got ${reply ? reply.length : 0} chars for chat=${chatId}`);
    const finalReply = reply || 'عذراً، حدث خطأ مؤقت. حاول مرة أخرى أو اكتب «مساعدة» 💡';
    const result = await sendMessageDetailed(finalReply, chatId);
    if (!result.delivered) {
      warn('telegram', `async-reply DELIVERY FAILED: ${result.error} chat=${chatId}`);
      // Retry via outbox as last resort
      enqueueReply(updateId, chatId, finalReply);
    }
  } catch (caught) {
    warn('telegram', `async-reply FAILED: ${caught.message} chat=${chatId}`);
    try { enqueueReply(updateId, chatId, 'عذراً، حدث خطأ مؤقت. حاول مرة أخرى 💡'); } catch {}
  }
}

export async function handleTelegramUpdate(update) {
  const chatId = String(update.message?.chat?.id || update.edited_message?.chat?.id || update.callback_query?.message?.chat?.id || '');
  const fromId = String(update.message?.from?.id || update.edited_message?.from?.id || update.callback_query?.from?.id || '');
  const msgText = update.message?.text || update.edited_message?.text || update.callback_query?.data || '';
  // Handle pre_checkout_query for Telegram Stars payments
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    const fromId = String(pcq.from?.id || '');
    const isBlocked = config.telegramAllowedIds.length > 0 && !config.telegramAllowedIds.includes(fromId);
    const { telegramRequest } = await import('./telegram-api.js');
    await telegramRequest(config.telegramToken, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: pcq.id,
      ok: !isBlocked,
      error_message: isBlocked ? 'غير مصرح' : undefined
    }, 10000).catch(e => warn('telegram', 'pre_checkout answer failed: ' + e.message));
    if (!isBlocked) {
      info('telegram', 'pre_checkout approved for ' + fromId);
    }
    return true;
  }

  // Detailed diagnostic logging
  info('telegram', `INCOMING: chatId=${chatId} fromId=${fromId} text=${String(msgText).slice(0, 60)} mode=${mode}`);
  info('telegram', `ALLOWLIST: parsed=${JSON.stringify(config.telegramAllowedIds)} len=${config.telegramAllowedIds.length}`);
  info('telegram', `CHATID_ALLOWED=${config.telegramAllowedIds.includes(chatId)} FROMID_ALLOWED=${config.telegramAllowedIds.includes(fromId)}`);
  // Allowlist check (use either chatId or fromId for maximum compatibility)
  const isBlocked = config.telegramAllowedIds.length > 0 && !(config.telegramAllowedIds.includes(chatId) || config.telegramAllowedIds.includes(fromId));
  if (isBlocked) {
    info('telegram', `blocked sender: chat_id=${chatId} from_id=${fromId} (not in TELEGRAM_ALLOWED_IDS = ${JSON.stringify(config.telegramAllowedIds)})`);
    return false;
  }
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
  // Handle successful_payment for Telegram Stars
  if (update.message?.successful_payment) {
    const payResult = handleSuccessfulPayment(update.message.successful_payment, update.message.from || {});
    sendMessageDetailed(payResult, chatId).catch(() => {});
    info('telegram', 'stars_payment_received: ' + (update.message.successful_payment.total_amount || 0) + ' XTR from ' + fromId);
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
  // Layer 5: Rate limiting + anomaly detection
  if (update.message?.from?.id) {
    if (!telegramRateLimit(update.message.from.id)) {
      info('telegram', `rate limited: user ${update.message.from.id}`);
      return true;
    }
    detectAnomaly(update.message.from.id, update.message.text);
  }

  if (update.message?.text && !update.message.text.startsWith('/')) {
    info('telegram', `DISPATCH async: chatId=${chatId} text=${String(update.message.text).slice(0,50)}`);
    asyncContextualReply(update.update_id, chatId, update.message.text, update.message.from || {});
  } else if (update.message?.text?.startsWith('/')) {
    await handleCommand(update.message);
  }
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

  // Only 4 essential commands remain as slash commands
  const aliases = { '/help': '/start', '/menu': '/start', '/start-2fa': '/start' };
  const resolved = aliases[command] || command;

  // ALL OTHER COMMANDS → natural language brain
  if (resolved && !['/start', '/products', '/pay', '/approve-product'].includes(resolved)) {
    try {
      const naturalReply = await processNaturalMessage(message.text, message.from || {});
      if (naturalReply) enqueueReply(null, replyChatId, naturalReply);
    } catch (e) {
      enqueueReply(null, replyChatId, 'عذراً، حدث خطأ. حاول مرة أخرى 💡');
    }
    return;
  }

  if (resolved === '/start') {
    enqueueReply(null, replyChatId, [
      'مرحباً بك في متجر عمالقة الصمت! 🛒',
      '',
      '💬 اكتب ما تحتاجه بالعربية الطبيعية!',
      '• "أريد منتجات المتجر" — عرض المنتجات',
      '• "اكتب لي مقالاً" — إنشاء مهمة',
      '• "قدّم على وظيفة" — التقديم على فرص عمل',
      '• "تقرير يومي" — ملخص الأداء',
      '• "حالة النظام" — فحص صحة النظام',
      '',
      '🛒 للشراء: اكتب «اشتري <رقم>»',
      '📊 الدفع: USDT/USDC — تسليم خلال ساعة ✓'
    ].join('\n'));
  } else if (resolved === '/products') {
    const { PRODUCTS, productCatalogue, paymentInfo } = await import('./storefront.js');
    const lines = ['🛒 متجر عمالقة الصمت:', ''];
    for (const p of PRODUCTS) {
      lines.push(`  ${p.name} — $${p.price} (أو ${p.stars} نجمة)`);
    }
    lines.push('', paymentInfo());
    lines.push('', '💬 اكتب «اشتري <رقم>» للشراء!');
    enqueueReply(null, replyChatId, lines.join('\n'));
  } else if (resolved.startsWith('/pay ')) {
    const payId = resolved.slice(5).trim();
    const args = sendInvoiceArgs(chatId, payId);
    if (!args) {
      enqueueReply(null, replyChatId, '❌ رقم منتج غير صالح. اكتب "منتجات المتجر" لرؤية القائمة.');
    } else {
      const { telegramRequest } = await import('./telegram-api.js');
      await telegramRequest('sendInvoice', args);
    }
  } else if (resolved.startsWith('/approve-product ')) {
    const parts = message.text.split(/\s+/);
    const productId = Number(parts[1]);
    const decision = parts[2];
    if (!productId || !decision || !['yes', 'no'].includes(decision)) {
      enqueueReply(null, replyChatId, 'الاستخدام: /approve-product <رقم> yes|no');
    } else {
      const { decideProductApproval } = await import('./production.js');
      const result = decideProductApproval(productId, decision === 'yes');
      if (result.error) {
        enqueueReply(null, replyChatId, '❌ ' + result.error);
      } else {
        enqueueReply(null, replyChatId, decision === 'yes'
          ? `✅ تم موافقة على المنتج #${productId} ونشره.`
          : `❌ تم رفض المنتج #${productId}.`);
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

  info('telegram', `TELEGRAM_ALLOWED_IDS env = ${process.env.TELEGRAM_ALLOWED_IDS || '(empty)'}`);
  info('telegram', `telegramAllowedIds parsed = ${JSON.stringify(config.telegramAllowedIds)}`);
  info('telegram', `telegramAdminChatId = ${config.telegramChatId}`);
  info('telegram', `platformRole = ${config.platformRole}`);
  info('telegram', `telegramFailover = ${config.telegramFailover}`);

  await syncTelegramWebhook();
  setInterval(() => syncTelegramWebhook().catch(() => {}), 60_000).unref();

  // On backup/render role with failover disabled: do NOT start polling (prevents token conflict)
  if (config.platformRole === 'render' && !config.telegramFailover) {
    mode = 'disabled';
    info('telegram', 'disabled on backup service (failover=false); primary service handles all polling');
    return;
  }

  // Exclusive webhook mode: when TELEGRAM_WEBHOOK_URL is set, never poll. Telegram then
  // delivers updates ONLY to this service's /telegram/webhook and any external poller
  // (e.g. a bridge with the same token) is rejected with 409 conflict.
  if (config.telegramWebhookUrl) {
    mode = 'webhook';
    info('telegram', `using webhook mode exclusively: ${config.telegramWebhookUrl} (polling disabled)`);
    // Keep the webhook asserted: an external poller (e.g. a Termux copy of this bot)
    // gets 409 while a webhook is active and may call deleteWebhook to "fix" it.
    // Re-assert every minute so this service stays the single update consumer.
    const assertWebhook = async () => {
      try {
        const res = await telegramRequest(config.telegramToken, 'setWebhook', {
          url: config.telegramWebhookUrl,
          secret_token: config.telegramWebhookSecret || undefined,
          drop_pending_updates: false
        }, 8000);
        if (!res.ok) warn('telegram', `webhook keeper: setWebhook HTTP ${res.status}`);
      } catch (e) { warn('telegram', `webhook keeper failed: ${e.message}`); }
    };
    await assertWebhook();
    setInterval(assertWebhook, 60_000).unref();
    const outboxLoop = async () => {
      try { await processTelegramOutbox(); } catch {}
      setTimeout(outboxLoop, 3000).unref();
    };
    setTimeout(outboxLoop, 1000).unref();
    return;
  }

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
