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
  jobs.push(cron.schedule('0 10 * * *', async () => {
    info('scheduler', '🌅 Morning report (10:00 UTC)...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('morning');
    } catch (e) { errLog('scheduler', `Morning report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2b. Afternoon report (16:00 UTC) ──
  jobs.push(cron.schedule('0 16 * * *', async () => {
    info('scheduler', '📊 Afternoon report (16:00 UTC)...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('afternoon');
    } catch (e) { errLog('scheduler', `Afternoon report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2d. Night report (04:00 UTC) ──
  jobs.push(cron.schedule('0 4 * * *', async () => {
    info('scheduler', '🌙 Night report (04:00 UTC)...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('night');
    } catch (e) { errLog('scheduler', `Night report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2c. Evening report (every day at 20:00 UTC) ──
  jobs.push(cron.schedule('0 22 * * *', async () => {
    info('scheduler', '🌙 Evening report (22:00 UTC)...');
    try {
      const { default: reporter } = await import('./reporter.js');
      await reporter.sendReport('evening');
    } catch (e) { errLog('scheduler', `Evening report failed: ${e.message}`); }
  }, { timezone: 'UTC' }));

  // ── 2c. Marketing cycle (every 4 hours) ──
  jobs.push(cron.schedule('0 */4 * * *', async () => {
    if (process.env.CONTINUOUS_PRODUCTION_ENABLED === 'false') { info('scheduler', 'Production DISABLED by leader instruction'); return; }
    info('scheduler', '📣 Marketing cycle...');
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
    if (process.env.CONTINUOUS_PRODUCTION_ENABLED === 'false') { info('scheduler', 'Production DISABLED by leader instruction'); return; }
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

  // ── 10. Continuous production (DISABLED by leader) ──
  jobs.push(cron.schedule('*/30 * * * *', async () => {
    if (process.env.AUTO_PRODUCTION === 'false') { info('scheduler', 'Auto-production DISABLED by leader instruction'); return; }
    info('scheduler', '🏭 Production cycle (fast category)...');
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

  // ── 11. Followup cycle (every 6 hours) ──
  jobs.push(cron.schedule('0 */6 * * *', async () => {
    info('scheduler', '🔄 Followup cycle...');
    try {
      const { default: followup } = await import('./automation/followup-scheduler.js');
      await followup.runFollowupCycle();
    } catch (e) { errLog('scheduler', `Followup cycle failed: ${e.message}`); }
  }, { timezone: 'UTC' }));
