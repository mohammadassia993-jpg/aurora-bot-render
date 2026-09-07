/**
 * natural-assistant.js — Natural language brain for Aurora bot
 *
 * Single entry point: understand the user's intent and execute it.
 * Uses Agnes AI (or fallback model) with tool-calling prompt.
 * No slash commands needed — everything via natural Arabic.
 */
import { db } from './db.js';
import { config } from './config.js';
import { callModel, selectModel } from './ai.js';
import { info, warn } from './logger.js';
import { recordLesson } from './memory.js';

// ── Available Actions (tools the brain can invoke) ──
const ACTIONS = {
  store_catalog: { description: 'عرض منتجات المتجر والأسعار', triggers: /(?:منتجات|متجر|اسعار|اشتري|شراء|buy|catalog|المنتجات|catalogue)/i },
  system_status: { description: 'فحص حالة النظام', triggers: /(?:حالة|status|النظام|يعمل|مشكلة|بطيء|silently)/i },
  create_task: { description: 'إنشاء مهمة وتنفيذها', triggers: /(?:مهمة|task|انفذ|افعل|ابدأ|نفّذ|شغل|اكتب|حرّر|ترجم|حلل|commence|write|translate)/i },
  job_apply: { description: 'التقديم على وظيفة', triggers: /(?:وظيفة|job|تقديم|apply|فرصة عمل|وظائف)/i },
  daily_report: { description: 'تقرير يومي', triggers: /(?:تقرير|report|ملخص|summary|today|اليوم|أداء)/i },
  delegation_status: { description: 'حالة التفويض والوكلاء', triggers: /(?:تفويض|وكلاء|delegation|agent|الأحدام)/i },
  production_report: { description: 'تقرير الإنتاج', triggers: /(?:إنتاج|factory|منتجات رقمية| catalogs|CATALOG|CATALOG)/i },
  email_check: { description: 'فحص البريد', triggers: /(?:بريد|email|mail|رسائل)/i },
  market_analysis: { description: 'تحليل السوق', triggers: /(?:سوق|market|اتجاهات|trends|فرضص)/i },
  proofread: { description: 'تدقيق لغوي', triggers: /(?:تدقيق|proofread|تصحيح|أخطاء)/i },
  approve_product: { description: 'الموافقة على منتج', triggers: /(?: approve |同意|CONFIRM| accept |تمام|موافق|ACCEPT)/i },
  help_natural: { description: 'مساعدة عامة', triggers: /(?:مساع|help|ماذا تستطيع|fähren|abilities|what can you| Options)/i }
};

// ── Brain Prompt (Agnes AI) ──
function brainPrompt(message, isLeader, context) {
  return `أنت أورورا، مساعدة ذكية طبيعية تماماً. تتحدثين بالعربية الفصحى الواضحة والودودة. لا تستخدمين أوامر بـ / أبداً. أنتي مثل ChatGPT لكنك أكثر عمقاً و芎راً.

لديك القدرات التالية:
- عرض منتجات المتجر ($store_catalog)
- فحص حالة النظام ($system_status)
- إنشاء مهمة وتنفيذها ($create_task)
- التقديم على وظائف ($job_apply)
- إرسال تقرير يومي ($daily_report)
- متابعة حالة التفويض ($delegation_status)
- تقرير الإنتاج ($production_report)
- فحص البريد الوارد ($email_check)
- تحليل السوق ($market_analysis)
- تدقيق نصوص ($proofread)
- تأكيد طلب شراء ($approve_product)
- مساعدة عامة ($help_natural)

${isLeader ? 'المستخدم هو القائد — اسمه محمد عباس.' : 'المستخدم عضو في فريق العمل.'}

هذا حال النظام:
- صحة: ${context.health}
- مهام: ${context.tasks}
- موافقات معلقة: ${context.pendingApprovals}

الCtx: ${context.history}

سجّل طلب المستخدم أن:
- إذا أراد منتجات: أظهر له المنتجات والأسعار ($store_catalog)
- إذا سأل عن النظام: فحص وقدم التفاصيل ($system_status)
- إذا طلب إنجاز عمل: نفّذ المهمة عبر $create_task
- إذا طلب وظيفة: قدّم عليه عبر $job_apply
- إذا طلب تقرير: أرسل التقرير عبر $daily_report
- إذا سأل عن الوكلاء: أعطه حالة التفويض ($delegation_status)
- إذا طلب حجراً أو منتجاً جديداً: عبر $production_report
- إذا طلب بريداً: فحص عبر $email_check
- إذا طلب تحليل السوق: عبر $market_analysis
- إذا طلب تدقيقاً: عبر $proofread

المطلوب:
1. أعد JSON فقط بتنسيق: {"action":"اسم_العمل","reply":"رسالتك_الطبيعي","params":{...}}
2. اجعل الرد自然而ودود وقصيراً (سطر أو اثنين).
3. إذا لم تفهم الطلب، أعطِ رد "help_natural" مع شرح بسيط.
4. لا تستخدم أوامر / أبداً.

رسالة المستخدم: "${message}"`;
}

// ── Action Executor ──
async function executeAction(action, params, isLeader, message) {
  switch (action) {
    case 'store_catalog': {
      const { PRODUCTS, productCatalogue, paymentInfo } = await import('./storefront.js');
      const lines = ['🛒 متجر عمالقة الصمت — منتجات رقمية جاهزة للتسليم:', ''];
      for (const p of PRODUCTS) {
        lines.push(`  ${p.name}`);
        lines.push(`  💰 ${p.price}$ (أو ${p.stars} نجمة Telegram)`);
        lines.push('');
      }
      lines.push(paymentInfo());
      lines.push('', '💬 اكتب «اشتري 1» أو «أريد قاموس Web3» واشترِ فوراً!');
      return lines.join('\n');
    }
    case 'system_status': {
      const rows = db.prepare(`SELECT component, healthy, detail FROM health_checks WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)`).all();
      const labels = { gateway: 'البوابة', internet: 'الإنترنت', telegram: 'تلغرام', ai: 'الذكاء', memory: 'الذاكرة', disk: 'التخزين', email: 'البريد', channel: 'القناة' };
      const lines = ['🏥 حالة النظام:', ''];
      for (const r of rows) {
        lines.push(`  ${r.healthy ? '✅' : '❌'} ${labels[r.component] || r.component}: ${r.detail || 'ok'}`);
      }
      return lines.join('\n');
    }
    case 'create_task': {
      const { createTask, runTaskFlow } = await import('./task-flow.js');
      const taskTitle = message || params.title || 'مهمة عامة';
      const taskId = createTask(taskTitle, 'leader');
      runTaskFlow(taskId).then(async results => {
        const summary = [
          `✅ تم إنجاز المهمة #${taskId}: "${taskTitle}"`,
          '',
          results.planner ? `📋 المخطط: ${String(results.planner).slice(0, 200)}` : '',
          results.executor ? `⚙️ المنفذ: ${String(results.executor).slice(0, 200)}` : '',
          results.reviewer ? `🔍 المراجع: ${String(results.reviewer).slice(0, 200)}` : '',
          '📊 المهمة مكتملة.'
        ].filter(Boolean).join('\n');
        const { notifyBot } = await import('./helper-notify.js'); await notifyBot(summary);
      }).catch(() => {});
      return `✅ جارٍ تنفيذ المهمة: "${taskTitle}"\n\n🔄 الخطوات:\n1. 📋 المخطط يحلل...\n2. ⚙️ المنفذ ينفّذ...\n3. 🔍 المراجع يراجع...\n\nسأبلغك فور الانتهاء! 🎯`;
    }
    case 'job_apply': {
      const { submitAllOpportunities } = await import('./job-applicant.js');
      const result = await submitAllOpportunities();
      return `📨 تم التقديم على جميع فرص العمل:\n\n✅ مقدّم: ${result.submitted.length}\n⏭️ تجاوز: ${result.skipped.length}\n❌ أخطاء: ${result.errors.length}\n\n📬 سأرسل لك تقرير لكل طلب.`;
    }
    case 'daily_report': {
      const { generateDailyReport, buildProductionReport } = await import('./command-center.js');
      const report = generateDailyReport();
      const prod = buildProductionReport();
      return report + '\n\n' + prod;
    }
    case 'delegation_status': {
      const { getDelegationStatus } = await import('./delegation.js');
      return getDelegationStatus();
    }
    case 'production_report': {
      const { buildProductionReport } = await import('./production.js');
      return buildProductionReport();
    }
    case 'email_check': {
      const { mailQueueStats } = await import('./mail.js');
      const stats = mailQueueStats();
      return `📬 حالة البريد:\n  • م	queue: ${stats.queued || 0} رسالة\n  • مرسلة: ${stats.sent || 0}\n  • فاشلة: ${stats.failed || 0}`;
    }
    case 'market_analysis': {
      const { runMarketAnalysis } = await import('./production.js');
      const m = await runMarketAnalysis();
      const topics = (m.top_topics || []).slice(0, 3).map(t => `• ${t.topic} (${t.demand})`).join('\n');
      return `📊 تحليل السوق:\n${topics || 'لا توجد بيانات بعد'}`;
    }
    case 'proofread': {
      const { proofreadText } = await import('./production.js');
      const text = params.text || message || '';
      const result = await proofreadText(text);
      return `🔍 نتائج التدقيق:\n  • المشاكل: ${result.totalIssues}\n  • النظيف: ${result.clean ? '✅' : '❌'}\n  • اللغة: ${result.layers.languagetool?.issues || 0}\n  • AI: ${result.layers.ai?.issues || 0}\n  • المصطلحات: ${result.layers.glossary?.hits || 0}`;
    }
    case 'approve_product': {
      const { getPendingProducts, decideProductApproval } = await import('./production.js');
      const pending = getPendingProducts();
      if (!pending.length) return '✅ لا توجد منتجات بانتظار الموافقة.';
      const lines = pending.map(p => `• #${p.id}: ${p.title} ($${p.price})`).join('\n');
      return `📦 منتجات بانتظار موافقتك:\n${lines}\n\n💬 اكتب "موافق على المنتج 1" أو "رفض المنتج 2"}`;
    }
    case 'help_natural': {
      return ['✨ أهلاً! أنا أورورا، مساعدتك الذكية.', '', 'يمكنني أن أساعدك في:', '  • عرض وشراء المنتجات الرقمية', '  • إنشاء وتنفيذ المهام', '  • التقديم على الوظائف', '  • فحص حالة النظام والبريد', '  • تقارير يومية وأسبوعية', '  • تحليل السوق والportuniteés', '  • تدقيق النصوص', '  • متابعة التفويض والإنتاج', '', '💬 اكتب ما تحتاجه بالعربية الطبيعية!'].join('\n');
    }
    default:
      return null;
  }
}

// ── Main Entry Point ──
export async function processNaturalMessage(text, sender = {}) {
  const message = String(text || '').trim();
  if (!message) return null;
  const isLeader = String(sender.id || '') === String(config.telegramChatId || '') ||
    String(sender.username || '').toLowerCase() === 'mohammadabbas891';

  // Gather system context
  const healthRows = db.prepare(`SELECT component, healthy FROM health_checks WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)`).all();
  const healthy = healthRows.filter(r => r.healthy).length;
  const healthStr = `${healthy}/${healthRows.length} من المكونات سليمة`;

  const taskStats = db.prepare("SELECT status, COUNT(*) c FROM tasks GROUP BY status").all();
  const taskStr = taskStats.map(r => `${r.status}:${r.c}`).join('، ') || 'لا توجد مهام';

  const pendingApprovals = db.prepare("SELECT COUNT(*) c FROM approvals WHERE state='pending'").get().c;
  const history = db.prepare(`SELECT sender, body FROM messages WHERE thread='telegram' ORDER BY id DESC LIMIT 6`).all().reverse();
  const histStr = history.slice(-3).map(r => `${r.sender}: ${r.body?.slice(0, 60)}`).join(' | ');

  // Quick regex match first (faster, no AI needed)
  if (/(cat|catalogue|المنتجات|متجر|اسعار|الأسعار|اكتب «اشتري|كم سعر)/i.test(message)) {
    return await executeAction('store_catalog', {}, isLeader, message);
  }

  // Agnes AI brain
  const prompt = brainPrompt(message, isLeader, {
    health: healthStr,
    tasks: taskStr,
    pendingApprovals,
    history: histStr.slice(0, 300)
  });

  try {
    const response = await Promise.race([callModel('aurora', prompt), new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 25000))]).catch(e => { warn('natural-assistant', e.message); return ''; });
    const clean = String(response).replace(/```json|```/g, '').trim();

    // Try to parse JSON action
    const jsonMatch = clean.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const action = parsed.action || 'help_natural';
      const reply = parsed.reply || '';
      const params = parsed.params || {};

      // Execute the action
      const result = await executeAction(action, params, isLeader, message);
      if (result) return result;
      if (reply && reply !== result) return reply;
    }

    // Fallback: return the AI's natural response directly
    const naturalReply = clean.replace(/[<>]/g, '').trim();
    if (naturalReply.length > 10 && !/\[aurora\]|\[executor\]|local draft|Status: deterministic|المحاكاة الذكية/.test(naturalReply)) {
      return naturalReply;
    }
  } catch (e) {
    warn('natural-assistant', `AI error: ${e.message}`);
  }

  // Final fallback
  return 'عذراً، لم أفهم طلبك تماماً 💡 اكتب ما تحتاجه بوضوح وسأساعدك فوراً!\n\nمثل:\n• "أريد منتجات المتجر"\n• "اقفل النظام"\n• "قديم وظيفة على Superteam"';
}

