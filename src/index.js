import { setInterval as cronInterval } from 'node:timers';
import { config } from './config.js';
import { backupDatabase } from './db.js';
import { info, error } from './logger.js';
import { startServer } from './server.js';
import { runWatchdog } from './watchdog.js';
import { runConnectors } from './connectors.js';
import { startWalletMonitors } from './wallets.js';
import { startTunnelWatcher, writePublicLink } from './tunnel.js';
import { startTelegram, dailyReport } from './telegram.js';
import { publishDailyDigest } from './notifications.js';
import { createBackupSnapshot, runMailQueue } from './backup.js';
import { teamEvents } from './team.js';

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
  } catch (caught) {
    error('watchdog', caught.message);
  }
}, 30_000);
await runWatchdog();
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
    backupDatabase();
  } catch (caught) {
    error('report', caught.message);
  }
}, 10 * 60_000);

startWalletMonitors();
startTunnelWatcher();
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
