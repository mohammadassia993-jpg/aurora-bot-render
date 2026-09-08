/**
 * reporter.js — Reporter Agent (وكيل التقارير)
 *
 * Auto-generates and sends daily reports:
 * - Tasks completed today
 * - Products created/published
 * - Opportunities discovered
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

class ReporterAgent {
  constructor() {
    this.reportsSent = 0;
  }

  /** Generate and send daily report */
  async sendDailyReport() {
    info('reporter', '📊 Generating daily report...');

    // Gather data
    const today = new Date().toISOString().split('T')[0];

    const tasksToday = db.prepare(`
      SELECT COUNT(*) c FROM tasks
      WHERE date(created_at) = date('now')
    `).get();

    const tasksCompleted = db.prepare(`
      SELECT COUNT(*) c FROM tasks
      WHERE date(updated_at) = date('now') AND status = 'done'
    `).get();

    const tasksDiscovered = db.prepare(`
      SELECT COUNT(*) c FROM tasks
      WHERE date(created_at) = date('now') AND source = 'initiator'
    `).get();

    const totalTasks = db.prepare('SELECT COUNT(*) c FROM tasks').get();
    const pendingTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE status NOT IN ('done', 'cancelled')").get();

    const recentEpisodes = EpisodicMemory.recent(10);
    const lessons = SemanticMemory.byDomain('lessons', 5);
    const memoryCtx = PersistentMemory.getContext('reporter');

    // Build report data
    const reportData = {
      date: today,
      tasksCreated: tasksToday.c,
      tasksCompleted: tasksCompleted.c,
      tasksDiscovered: tasksDiscovered.c,
      totalTasks: totalTasks.c,
      pendingTasks: pendingTasks.c,
      recentActivity: recentEpisodes.map(e => `${e.event_type}: ${e.title} [${e.outcome}]`).join('\n') || 'لا يوجد نشاط',
      lessons: lessons.map(l => `- ${l.topic}: ${l.content.slice(0, 80)}`).join('\n') || 'لا توجد دروس جديدة',
      memoryContext: memoryCtx
    };

    // Generate natural Arabic report
    const prompt = `أنت وكيل التقارير في نظام عمالقة الصمت. أنشئ تقريراً يومياً بالعربية الفصحى.

بيانات اليوم:
- التاريخ: ${reportData.date}
- مهام جديدة: ${reportData.tasksCreated}
- مهام منجزة: ${reportData.tasksCompleted}
- فرص مكتشفة: ${reportData.tasksDiscovered}
- إجمالي المهام: ${reportData.totalTasks}
- مهام معلقة: ${reportData.pendingTasks}

النشاط الأخير:
${reportData.recentActivity}

الدروس المستفادة:
${reportData.lessons}

الذاكرة:
${memoryCtx.working}

التعليمات:
1. اكتب تقريراً واضحاً ومرتباً بالعربية الطبيعية.
2. ابدأ بملخص تنفيذي.
3. اذكر الإنجازات والتحديات.
4. اختم بخطة الغد.
5. لا تستخدم JSON أو أكواد.`;

    try {
      const response = await callModel('reporter', prompt);
      const reportText = String(response).trim();

      if (reportText.length > 50) {
        // Send via Telegram
        const delivered = await sendMessageDetailed(reportText, config.telegramChatId);
        info('reporter', `✅ Daily report sent (${reportText.length} chars, delivered: ${delivered})`);

        // Record in memory
        EpisodicMemory.record('report_sent', 'reporter', null, 'Daily Report', reportText.slice(0, 200), 'success');

        // Fire event
        await eventBus.fire(EVENTS.REPORT_READY, {
          type: 'daily',
          length: reportText.length,
          delivered
        });

        this.reportsSent++;
        return { success: true, length: reportText.length, delivered };
      }
    } catch (e) {
      warn('reporter', `Report generation failed: ${e.message}`);

      // Fallback: send structured report
      const fallbackReport = this.buildFallbackReport(reportData);
      try {
        await sendMessageDetailed(fallbackReport, config.telegramChatId);
        this.reportsSent++;
        return { success: true, fallback: true, length: fallbackReport.length };
      } catch (e2) {
        warn('reporter', `Fallback report also failed: ${e2.message}`);
      }
    }

    return { success: false };
  }

  /** Build a fallback report without AI */
  buildFallbackReport(data) {
    return [
      `📊 تقرير يومي — ${data.date}`,
      '',
      `📋 الملخص:`,
      `  • مهام جديدة: ${data.tasksCreated}`,
      `  • مهام منجزة: ${data.tasksCompleted}`,
      `  • فرص مكتشفة: ${data.tasksDiscovered}`,
      `  • إجمالي المهام: ${data.totalTasks}`,
      `  • مهام معلقة: ${data.pendingTasks}`,
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

  /** Generate on-demand report */
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
        tasksCreated: 0, tasksCompleted: 0, tasksDiscovered: 0,
        totalTasks: 0, pendingTasks: 0
      });
    }
  }

  getStats() {
    return { reportsSent: this.reportsSent };
  }
}

export const reporter = new ReporterAgent();
export default reporter;
