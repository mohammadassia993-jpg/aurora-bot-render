import { setInterval as cronInterval } from 'node:timers';
import { config } from './config.js';
import { backupDatabase } from './db.js';
import { info, error } from './logger.js';
import { startServer } from './server.js';
import { runWatchdog, checkEmail } from './watchdog.js';
import { runConnectors } from './connectors.js';
import { startWalletMonitors } from './wallets.js';
import { startTunnelWatcher, writePublicLink } from './tunnel.js';
import { startTelegram, dailyReport, sendMessageDetailed } from './telegram.js';
import { initDelegation } from './delegation.js';
import { startOperations, startPrizesReport } from './operations.js';
import { startProductionMachine } from './production.js';
import { publishDailyDigest } from './notifications.js';
import { createBackupSnapshot, runMailQueue } from './backup.js';
import { teamEvents } from './team.js';
import { startAutomator } from './automator.js';
import { startOpportunityMonitor } from './job-applicant.js';

process.on('unhandledRejection', reason => error('process', 'unhandled rejection', { reason: String(reason) }));
process.on('uncaughtException', caught => {
  error('process', 'uncaught exception', { error: caught.stack });
  process.exit(1);
});

const server = await startServer();
info('platform', `dashboard listening on port ${config.port}`);

setInterval(async () => {
  try {
    await runWatchdog();

// Hourly email check (dedicated interval, supplements watchdog)
setInterval(async () => {
  try {
    await checkEmail();
  } catch (caught) {
    error('email_hourly', caught.message);
  }
}, 60 * 60 * 1000); // every 60 minutes
  } catch (caught) {
    error('watchdog', caught.message);
  }
}, 30_000);
await runWatchdog();
initDelegation();
await startTelegram();
createBackupSnapshot().catch(caught => error('backup', caught.message));
setInterval(() => createBackupSnapshot().catch(caught => error('backup', caught.message)), config.backupIntervalMinutes * 60_000);

let importantChangeTimer;
teamEvents.on('message', () => {
  if (config.platformRole !== 'primary') return;
  clearTimeout(importantChangeTimer);
  importantChangeTimer = setTimeout(() => {
    createBackupSnapshot().then(result => info('backup', 'important-change sync complete', result.sync))
      .catch(caught => error('backup', `important-change sync failed: ${caught.message}`));
  }, 15_000).unref();
});
setInterval(() => runMailQueue().catch(caught => error('mail_queue', caught.message)), config.mailQueueIntervalMinutes * 60_000);

if (config.autoRunConnectors) {
  setInterval(() => runConnectors().catch(caught => error('connectors', caught.message)), 15 * 60_000);
  runConnectors().catch(caught => error('connectors', caught.message));
}

cronInterval(async () => {
  if (new Date().getHours() !== config.dailyReportHour) return;
  try {
    const result = await import('./notifications.js').then(module => module.publishDailyDigest());
    info('report', 'daily digest cycle', result);
    if (result.published) {
      const delivered = await sendMessageDetailed(dailyReport());
      info('report', 'daily report delivered to leader', { delivered });
    }
    backupDatabase();
  } catch (caught) {
    error('report', caught.message);
  }
}, 10 * 60_000);

startWalletMonitors();
startTunnelWatcher();
startAutomator();
startOpportunityMonitor();
startOperations();
startPrizesReport();
startProductionMachine();
// Daily security report + platform discovery (lazy-loaded)
setInterval(async () => {
  try {
    const { buildSecurityReport, auditWalletSecurity } = await import('./security.js');
    const report = buildSecurityReport();
    const wallet = auditWalletSecurity();
    const walletLine = wallet.passed ? 'ok' : 'issues: ' + (wallet.issues || []).join(', ');
    await sendMessageDetailed(report + '\n\nWallet: ' + walletLine, config.telegramChatId);
  } catch (e) { error('daily_security', e.message); }
}, 24 * 60 * 60 * 1000);
setInterval(async () => {
  try {
    const { callModel } = await import('./ai.js');
    const resp = await callModel('scout', 'List 3 new digital product selling platforms with API support. JSON: {platforms:[{name,url,api,language}]}');
    const match = String(resp).match(/\{[\s\S]*platforms[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      if (p.platforms?.length) await sendMessageDetailed('New platforms: ' + p.platforms.map(x => x.name + ' ' + x.url).join(', '), config.telegramChatId);
    }
  } catch (e) { error('platform_discovery', e.message); }
}, 24 * 60 * 60 * 1000);
if (process.env.DAILY_RESEARCH_ENABLED !== 'false') {
  setInterval(async () => {
    try {
      const result = await import('./research.js').then(module => module.runDailyResearch());
      info('daily_research', 'daily research cycle', result);
    } catch (caught) {
      error('daily_research', caught.message);
    }
  }, 24 * 60 * 60_000).unref();
  import('./research.js').then(module => module.runDailyResearch())
    .then(result => info('daily_research', 'initial daily research run', result))
    .catch(caught => error('daily_research', caught.message));
}
if (process.env.WEEKLY_RESEARCH_ENABLED !== 'false') {
  setInterval(async () => {
    try {
      await import('./research.js').then(module => module.runWeeklyResearch());
    } catch (caught) {
      error('weekly_research', caught.message);
    }
  }, 7 * 24 * 60 * 60_000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    info('platform', `${signal} received; stopping`);
    server.close(() => process.exit(0));
  });
}
