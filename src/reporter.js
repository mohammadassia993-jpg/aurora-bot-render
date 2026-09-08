/**
 * reporter.js — Reporter Agent (وكيل التقارير)
 *
 * Auto-generates and sends daily reports including:
 * - Tasks completed today
 * - Products created/published
 * - Prizes/competitions registered
 * - New platforms discovered
 * - Lessons learned
 * - Tomorrow's plan
 */
import { db } from './db.js';
import { info, warn } from './logger.js';
import { callModel } from './ai.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory, PersistentMemory } from './persistent-memory.js';
import { sendMessageDetailed } from './telegram.js';
import { config } from './config.js';
import { getProductionStats } from './continuous-production.js';
import { getPrizeStats, getPrizes } from './prize-scanner.js';
import { getDiscoveryStats, getDiscoveredPlatforms } from './platform-discovery.js';
import { getPublisherStats } from './multi-publisher.js';

class ReporterAgent {
  constructor() {
    this.reportsSent = 0;
  }

  async sendDailyReport() {
    info('reporter', '📊 Generating daily report...');

    const today = new Date().toISOString().split('T')[0];

    const tasksToday = db.prepare("SELECT COUNT(*) c FROM tasks WHERE date(created_at) = date('now')").get();
    const tasksCompleted = db.prepare("SELECT COUNT(*) c FROM tasks WHERE date(updated_at) = date('now') AND status = 'done'").get();
    const totalTasks = db.prepare('SELECT COUNT(*) c FROM tasks').get();
    const pendingTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE status NOT IN ('done', 'cancelled')").get();

    // 92 Tasks (bounty/task submissions)
    const tasks92Total = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('superteam', 'dework', 'gitcoin', 'bounty', 'prize_scan')").get().c;
    const tasks92Completed = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('superteam', 'dework', 'gitcoin', 'bounty', 'prize_scan') AND status = 'done'").get().c;
    const tasks92Submitted = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('superteam', 'dework', 'gitcoin', 'bounty', 'prize_scan') AND status IN ('submitted', 'done')").get().c;

    // Store Products
    const storeProducts = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('store', 'production')").get().c;
    const storePublished = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('store', 'production') AND status = 'done'").get().c;

    // Contracts
    const contractsTotal = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source = 'contract' OR title LIKE '%عقد%'").get().c;
    const contractsActive = db.prepare("SELECT COUNT(*) c FROM tasks WHERE (source = 'contract' OR title LIKE '%عقد%') AND status NOT IN ('done', 'cancelled')").get().c;

    // Jobs & Opportunities
    const jobsTotal = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('job', 'job_apply', 'job_scan')").get().c;
    const jobsApplied = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('job', 'job_apply', 'job_scan') AND status IN ('applied', 'submitted', 'done')").get().c;
    const jobsSuccess = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('job', 'job_apply', 'job_scan') AND status = 'done'").get().c;

    // Revenue
    const revenue = db.prepare("SELECT COALESCE(SUM(reward), 0) c FROM tasks WHERE status = 'done' AND reward > 0").get().c;

    const prodStats = getProductionStats();
    const prizeStats = getPrizeStats();
    const discoveryStats = getDiscoveryStats();
    const publisherStats = getPublisherStats();
    const recentEpisodes = EpisodicMemory.recent(10);
    const lessons = SemanticMemory.byDomain('lessons', 5);
    const memoryCtx = PersistentMemory.getContext('reporter');

    const reportData = {
      date: today,
      tasksCreated: tasksToday.c,
      tasksCompleted: tasksCompleted.c,
      totalTasks: totalTasks.c,
      pendingTasks: pendingTasks.c,
      production: prodStats,
      prizes: prizeStats,
      platforms: discoveryStats,
      publisher: publisherStats,
      tasks92: { total: tasks92Total, completed: tasks92Completed, submitted: tasks92Submitted },
      store: { total: storeProducts, published: storePublished },
      contracts: { total: contractsTotal, active: contractsActive },
      jobs: { total: jobsTotal, applied: jobsApplied, success: jobsSuccess },
      revenue,
      recentActivity: recentEpisodes.map(e => `${e.event_type}: ${e.title} [${e.outcome}]`).join('\n') || 'لا يوجد نشاط',
      lessons: lessons.map(l => `- ${l.topic}: ${l.content.slice(0, 80)}`).join('\n') || 'لا توجد دروس جديدة',
      memoryContext: memoryCtx
    };

    const prompt = `أنت وكيل التقارير في نظام عمالقة الصمت. أنشئ تقريراً يومياً شاملاً بالعربية الفصحى.

بيانات اليوم (${today}):
--- الإنتاج ---
- منتجات منتجة: ${prodStats.total}
- جاهزة للنشر: ${prodStats.approved}
- بانتظار الموافقة: ${prodStats.pending}
- منشورة: ${prodStats.published}
- حالة المحرك: ${prodStats.running ? 'يعمل' : 'متوقف'}

--- المهام ---
- مهام جديدة: ${tasksToday.c}
- مهام منجزة: ${tasksCompleted.c}
- إجمالي المهام: ${totalTasks.c}
- مهام معلقة: ${pendingTasks.c}

--- الجوائز والمسابقات ---
- إجمالي المتسجل: ${prizeStats.total}
- مكتشفة: ${prizeStats.discovered}
- تم التقديم: ${prizeStats.applied}
- فوز: ${prizeStats.won}

--- المهام الـ 92 (منتجات رقمية) ---
- إجمالي المهام: ${tasks92Total}
- مهام منجزة: ${tasks92Completed}
- تم تقديمها: ${tasks92Submitted}

--- المتجر ---
- إجمالي المنتجات: ${storeProducts}
- منشورة: ${storePublished}

--- العقود ---
- إجمالي العقود: ${contractsTotal}
- عقود نشطة: ${contractsActive}

--- الوظائف ---
- إجمالي الفرص: ${jobsTotal}
- تم التقديم: ${jobsApplied}
- نجاح: ${jobsSuccess}

--- الإيرادات ---
- إجمالي الإيرادات: $${revenue}

--- المنصات ---
- منصات مكتشفة: ${discoveryStats.total}
- مسجلة: ${discoveryStats.registered}
- قوائم النشر: ${publisherStats.queued}

النشاط الأخير:
${reportData.recentActivity}

الدروس:
${reportData.lessons}

التعليمات:
1. اكتب تقريراً واضحاً ومرتباً بالعربية الطبيعية.
2. ابدأ بملخص تنفيذي شامل.
3. اذكر كل بند بالتفصيل: المهام الـ 92، المتجر، العقود، الوظائف، الجوائز، الإنتاج، المنصات، الإيرادات.
4. اذكر أي عوائق أو مشاكل.
5. اختم بخطة الغد.
6. لا تستخدم JSON أو أكواد.`;

    try {
      const response = await callModel('reporter', prompt);
      const reportText = String(response).trim();

      if (reportText.length > 50) {
        const delivered = await sendMessageDetailed(reportText, config.telegramChatId);
        info('reporter', `✅ Daily report sent (${reportText.length} chars, delivered: ${delivered})`);
        EpisodicMemory.record('report_sent', 'reporter', null, 'Daily Report', reportText.slice(0, 200), 'success');
        await eventBus.fire(EVENTS.REPORT_READY, { type: 'daily', length: reportText.length, delivered });
        this.reportsSent++;
        return { success: true, length: reportText.length, delivered };
      }
    } catch (e) {
      warn('reporter', `Report generation failed: ${e.message}`);
    }

    // Fallback
    const fallbackReport = this.buildFallbackReport(reportData);
    try {
      await sendMessageDetailed(fallbackReport, config.telegramChatId);
      this.reportsSent++;
      return { success: true, fallback: true, length: fallbackReport.length };
    } catch (e2) {
      warn('reporter', `Fallback report also failed: ${e2.message}`);
    }
    return { success: false };
  }

  buildFallbackReport(data) {
    return [
      `📊 تقرير يومي — ${data.date}`,
      '',
      `📋 الملخص:`,
      `  • مهام جديدة: ${data.tasksCreated}`,
      `  • مهام منجزة: ${data.tasksCompleted}`,
      `  • إجمالي المهام: ${data.totalTasks}`,
      `  • مهام معلقة: ${data.pendingTasks}`,
      '',
      `🏭 الإنتاج:`,
      `  • منتجات: ${data.production.total}`,
      `  • جاهزة: ${data.production.approved}`,
      `  • منشورة: ${data.production.published}`,
      '',
      `🏆 الجوائز:`,
      `  • مكتشفة: ${data.prizes.discovered}`,
      `  • مسجلة: ${data.prizes.applied}`,
      '',
      `🔍 المنصات:`,
      `  • مكتشفة: ${data.platforms.total}`,
      `  • مسجلة: ${data.platforms.registered}`,
      '',
      `📝 آخر النشاطات:`,
      data.recentActivity.split('\n').map(l => `  ${l}`).join('\n'),
      '',
      `💡 الدروس:`,
      data.lessons.split('\n').map(l => `  ${l}`).join('\n'),
      '',
      `⏰ التقرير التالي: غداً صباحاً`
    ].join('\n');
  }

  async generateReport(type = 'status') {
    const context = PersistentMemory.getContext('reporter');
    const prompt = `أنت وكيل التقارير. أنشئ تقريراً فورياً بالعربية.

نوع التقرير: ${type}
السياق: ${context.recentTasks}
الدروس: ${context.lessons}

اكتب التقرير بالعربية الطبيعية.`;

    try {
      const response = await callModel('reporter', prompt);
      return String(response).trim();
    } catch (e) {
      return this.buildFallbackReport({
        date: new Date().toISOString().split('T')[0],
        recentActivity: context.recentTasks,
        lessons: context.lessons,
        tasksCreated: 0, tasksCompleted: 0,
        totalTasks: 0, pendingTasks: 0,
        tasks92: { total: 0, completed: 0, submitted: 0 },
        store: { total: 6, published: 0 },
        contracts: { total: 0, active: 0 },
        jobs: { total: 0, applied: 0, success: 0 },
        revenue: 0,
        production: { total: 0, approved: 0, pending: 0, published: 0, running: false },
        prizes: { total: 0, discovered: 0, applied: 0, won: 0 },
        platforms: { total: 0, registered: 0 },
        publisher: { queued: 0 }
      });
    }
  }

  getStats() {
    return { reportsSent: this.reportsSent };
  }

  async sendReport(type = 'morning') {
    if (type === 'morning') return this.sendMorningReport();
    if (type === 'evening') return this.sendEveningReport();
    return this.sendDailyReport();
  }

  async sendMorningReport() {
    return this._sendReport('صباحي', 'morning');
  }

  async sendEveningReport() {
    return this._sendReport('مسائي', 'evening');
  }

  async _sendReport(typeLabel, type) {
    info('reporter', `📊 Generating ${typeLabel} report...`);

    const tasksToday = db.prepare("SELECT COUNT(*) c FROM tasks WHERE date(created_at) = date('now')").get();
    const tasksCompleted = db.prepare("SELECT COUNT(*) c FROM tasks WHERE date(updated_at) = date('now') AND status = 'done'").get();
    const totalTasks = db.prepare('SELECT COUNT(*) c FROM tasks').get();
    const pendingTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE status NOT IN ('done', 'cancelled')").get();
    const prodStats = getProductionStats();
    const prizeStats = getPrizeStats();
    const discStats = getDiscoveryStats();
    const pubStats = getPublisherStats();
    const revenue = db.prepare("SELECT COALESCE(SUM(reward),0) c FROM tasks WHERE status='done' AND reward>0").get().c;

    const morningPrompt = `أنشئ تقريراً مботاً كاملاً لفريق عمالقة الصمت بالعربية. 
التقرير صباحي (07:00 صباحاً). حدد: ملخص إنجازات الأمس + المنتجات المنشورة + العقود والجوائز + الوظائف + الإيرادات + الدروس + خطة اليوم.

بيانات اليوم:
- مهام جديدة: ${tasksToday.c} | منجزة: ${tasksCompleted.c} | إجمالي: ${totalTasks.c} | معلقة: ${pendingTasks.c}
- منتجات: ${prodStats.total} (جاهزة: ${prodStats.approved}, منشورة: ${prodStats.published})
- جوائز: ${prizeStats.total} (مكتشفة: ${prizeStats.discovered}, تم التقديم: ${prizeStats.applied}, فوز: ${prizeStats.won})
- منصات: ${discStats.total} مكتشفة، نشر: ${pubStats.queued}
- الإيرادات: \$${revenue}

لا JSON، لا أكواد. رد عربي طبيعى بأسلوب احترافى.`;

    const eveningPrompt = `أنشئ تقريراً م-botaaً مسائياً لفريق عمالقة الصمت بالعربية. 
التقرير مسائي (20:00 مساءً). حدد: كل ما هو جديد اليوم + تفاعلات العملاء + إيرادات جديدة + تحديات + خطة الغد.

بيانات اليوم:
- مهام جديدة: ${tasksToday.c} | منجزة: ${tasksCompleted.c} | إجمالي: ${totalTasks.c} | معلقة: ${pendingTasks.c}
- منتجات: ${prodStats.total} (جاهزة: ${prodStats.approved}, منشورة: ${prodStats.published})
- جوائز: ${prizeStats.total} (مكتشفة: ${prizeStats.discovered}, تم التقديم: ${prizeStats.applied}, فوز: ${prizeStats.won})
- منصات: ${discStats.total} مكتشفة، نشر: ${pubStats.queued}
- الإيرادات: \$${revenue}

لا JSON، لا أكواد. رد عربي طبيعى بأسلوب احترافى.`;

    const prompt = type === 'morning' ? morningPrompt : eveningPrompt;

    try {
      const response = await callModel('reporter', prompt);
      const reportText = String(response).trim();

      if (reportText.length > 50) {
        const prefix = type === 'morning' ? '🌅 التقرير الصباحي' : '🌙 التقرير المسائي';
        const full = prefix + '\n\n' + reportText;
        const delivered = await sendMessageDetailed(full, config.telegramChatId);
        info('reporter', `✅ ${typeLabel} report sent (${full.length} chars)`);
        this.reportsSent++;
        return { success: true, delivered };
      }
    } catch (e) {
      warn('reporter', `${typeLabel} report failed: ${e.message}`);
    }
    return { success: false };
  }
}

export const reporter = new ReporterAgent();
export default reporter;
