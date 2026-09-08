/**
 * scheduler.js — Cron-based Task Scheduler Agent
 *
 * Runs recurring tasks automatically:
 * - Every morning: discover opportunities + daily report
 * - Every 2 hours: register competitions & contracts
 * - Every 15 min: health check
 * - Continuous: product production
 */
import cron from 'node-cron';
import { info, warn, error as errLog } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory } from './persistent-memory.js';

const jobs = [];

/** Start all scheduled jobs */
export function startScheduler() {
  info('scheduler', '🚀 Starting scheduler agent...');

  // ── 0. Bundle 92-tasks generation (daily at 05:00 UTC) ──
  jobs.push(cron.schedule('0 5 * * *', async () => {
    info('scheduler', '📦 Generating 92-tasks bundle...');
    try {
      const { default: tasksToProducts } = await import('./tasks-to-products.js');
      await tasksToProducts.generateBundle();
    } catch (e) { errLog('scheduler', `Bundle generation failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 1. Daily opportunity scan (every day at 06:00 UTC) ──
  jobs.push(cron.schedule('0 6 * * *', async () => {
    info('scheduler', '🌅 Morning opportunity scan starting...');
    try {
      const { default: initiator } = await import('./initiator.js');
      await initiator.scanOpportunities();
      await eventBus.fire(EVENTS.REPORT_DAILY, { type: 'morning_scan' });
    } catch (e) { errLog('scheduler', `Morning scan failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2a. Morning report (every day at 07:00 UTC) ──
  jobs.push(cron.schedule('0 8 * * *', async () => {
    info('scheduler', '🌅 Morning report generation...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('morning');
    } catch (e) { errLog('scheduler', `Morning report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2b. Accountability reports every 6 hours ──
  jobs.push(cron.schedule('0 */6 * * *', async () => {
    info('scheduler', '📊 6-hour accountability report...');
    try {
      const { default: reporter } = await import('./reporter.js');
      const { db } = await import('./db.js');
      const contacts = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source = 'lead'").get().c;
      const sent = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source = 'outreach'").get().c;
      const applied = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source IN ('job_apply','prize_scan') AND status = 'applied'").get().c;
      const revenue = db.prepare("SELECT COALESCE(SUM(reward),0) c FROM tasks WHERE status='done' AND reward>0").get().c;
      const { sendMessageDetailed } = await import('./telegram.js');
      const { config } = await import('./config.js');
      const msg = [
        '📊 تقرير المساءلة (كل 6 ساعات)',
        '',
        '🎯 الهدف: 1000$ خلال 7 أيام',
        '',
        '  📞 عملاء متواصل معهم: ' + contacts + '/100',
        '  📩 رسائل مرسلة: ' + sent + '/50',
        '  📝 تقديمات (وظائف/جوائز): ' + applied + '/40',
        '  💰 إيرادات: \$' + revenue + '/1000',
        '',
        revenue >= 1000 ? '✅ تم تحقيق الهدف!' : '⚡ لم يتحقق الهدف بعد — مواصلة العمل'
      ].join('\n');
      await sendMessageDetailed(msg, config.telegramChatId);
    } catch (e) {}
  }, { timezone: 'UTC' }));

  // ── 2c. Evening report (every day at 20:00 UTC) ──
  jobs.push(cron.schedule('0 20 * * *', async () => {
    info('scheduler', '🌙 Evening report generation...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('evening');
    } catch (e) { errLog('scheduler', `Evening report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2c. Marketing cycle (every 4 hours) ──
  jobs.push(cron.schedule('0 */4 * * *', async () => {
    info('scheduler', '⏭ Marketing DISABLED (Silent Hunter mode)'); return;
    try {
      const { default: marketing } = await import('./marketing-engine.js');
      await marketing.runMarketingCycle();
    } catch (e) { errLog('scheduler', `Marketing failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 3. Competition & contract registration (every 2 hours) ──
  jobs.push(cron.schedule('0 */2 * * *', async () => {
    info('scheduler', '🏆 Checking competitions & contracts...');
    try {
      const { default: initiator } = await import('./initiator.js');
      await initiator.scanCompetitions();
      await eventBus.fire(EVENTS.OPPORTUNITY_DISCOVERED, { source: 'competition_scan' });
    } catch (e) { errLog('scheduler', `Competition scan failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 4. Health check (every 15 minutes) ──
  jobs.push(cron.schedule('*/15 * * * *', async () => {
    try {
      const { default: watchdog } = await import('./watchdog.js');
      await watchdog.runWatchdog?.() || watchdog.default?.();
      await eventBus.fire(EVENTS.SYSTEM_HEALTH, { timestamp: new Date().toISOString() });
    } catch (e) { /* silent — watchdog has its own logging */ }
  }, { timezone: 'UTC' }));

  // ── 5. Product production cycle (every 4 hours) ──
  jobs.push(cron.schedule('0 */4 * * *', async () => {
    info('scheduler', '🏭 Production cycle starting...');
    try {
      const { default: production } = await import('./production.js');
      if (typeof production.startProductionCycle === 'function') {
        await production.startProductionCycle();
      }
      await eventBus.fire(EVENTS.PRODUCT_CREATED, { source: 'scheduled_production' });
    } catch (e) { errLog('scheduler', `Production cycle failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 6. Job applications (every 3 hours) ──
  jobs.push(cron.schedule('0 */3 * * *', async () => {
    info('scheduler', '💼 Job application cycle...');
    try {
      const { default: jobApplicant } = await import('./job-applicant.js');
      if (typeof jobApplicant.runOpportunityMonitor === 'function') {
        await jobApplicant.runOpportunityMonitor();
      }
    } catch (e) { errLog('scheduler', `Job scan failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 7. Email check (every 5 minutes) ──
  jobs.push(cron.schedule('*/5 * * * *', async () => {
    try {
      const { checkEmail } = await import('./watchdog.js');
      if (typeof checkEmail === 'function') await checkEmail();
    } catch (e) { /* silent */ }
  }, { timezone: 'UTC' }));

  // ── 8. Prize & competition scan (every hour) ──
  jobs.push(cron.schedule('0 * * * *', async () => {
    info('scheduler', '🏆 Hourly prize scan...');
    try {
      const { default: prizeScanner } = await import('./prize-scanner.js');
      await prizeScanner.scanPrizes();
    } catch (e) { errLog('scheduler', `Prize scan failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 9. New platform discovery (every 6 hours) ──
  jobs.push(cron.schedule('0 */6 * * *', async () => {
    info('scheduler', '🔍 Platform discovery scan...');
    try {
      const { default: platformDiscovery } = await import('./platform-discovery.js');
      await platformDiscovery.discoverPlatforms();
    } catch (e) { errLog('scheduler', `Platform discovery failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 10. Continuous production (every 30 minutes for fast category) ──
  jobs.push(cron.schedule('*/30 * * * *', async () => {
    info('scheduler', '⏭ Production DISABLED (Silent Hunter mode)'); return;
    try {
      const { default: continuousProd } = await import('./continuous-production.js');
      const stats = continuousProd.getProductionStats();
      if (stats.total < 50) {
        await continuousProd.startContinuousProduction();
      }
    } catch (e) { errLog('scheduler', `Production cycle failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── Record scheduler start in memory ──
  EpisodicMemory.record('system_start', 'scheduler', null, 'Scheduler Agent Started', `Active jobs: ${jobs.length}`, 'success', { jobCount: jobs.length });

  info('scheduler', `✅ Scheduler active with ${jobs.length} recurring jobs`);
  return jobs;
}

/** Stop all scheduled jobs */
export function stopScheduler() {
  for (const job of jobs) {
    job.stop();
  }
  info('scheduler', `⏹ Scheduler stopped (${jobs.length} jobs halted)`);
}

/** Get scheduler status */
export function getSchedulerStatus() {
  return {
    active: jobs.length,
    jobs: jobs.map((j, i) => ({
      index: i,
      running: j.running || false
    }))
  };
}

export default { startScheduler, stopScheduler, getSchedulerStatus };
