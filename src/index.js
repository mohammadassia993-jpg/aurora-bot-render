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
import { startScheduler } from './scheduler.js';
import { initiator } from './initiator.js';
import { reporter } from './reporter.js';
import { eventBus, EVENTS } from './event-bus.js';
import { startContinuousProduction } from './continuous-production.js';
import { publishToAllPlatforms } from './multi-publisher.js';
import { scanPrizes } from './prize-scanner.js';
import { discoverPlatforms } from './platform-discovery.js';
import { PersistentMemory } from './persistent-memory.js';

// ─────────────────────────────────────────────
// مفتاح التحكم في التقارير اليومية
// الافتراضي: true (يعمل كما هو)
// للإيقاف: أضف DAILY_REPORTS_ENABLED=false في Render Environment
// ─────────────────────────────────────────────
const DAILY_REPORTS_ENABLED = process.env.DAILY_REPORTS_ENABLED !== 'false';

process.on('unhandledRejection', reason => error('process', 'unhandled rejection', { reason: String(reason) }));
process.on('uncaughtException', caught => {
  error('process', 'uncaught exception', { error: caught.stack });
  process.exit(1);
});

const server = await startServer();
info('platform', `dashboard listening on port ${config.port}`);
info('platform', `⚙️ DAILY_REPORTS_ENABLED=${DAILY_REPORTS_ENABLED} (التقارير اليومية ${DAILY_REPORTS_ENABLED ? 'مفعّلة' : 'معطّلة'})`);

// Watchdog: كل 30 ثانية (داخلي، لا يُرسل)
setInterval(async () => {
  try {
    await runWatchdog();
  } catch (caught) {
    error('watchdog', caught.message);
  }
}, 30_000);

// فحص البريد: كل ساعة (داخلي)
setInterval(async () => {
  try {
    await checkEmail();
  } catch (caught) {
    error('email_hourly', caught.message);
  }
}, 60 * 60 * 1000);

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

// ─────────────────────────────────────────────
// التقارير اليومية — تتحكم بها DAILY_REPORTS_ENABLED
// ─────────────────────────────────────────────
if (DAILY_REPORTS_ENABLED) {
  info('reports', '📤 التقارير اليومية مُفعَّلة');

  // التقرير اليومي (Daily Digest + رسالة Telegram)
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

  // التقرير الأمني اليومي
  setInterval(async () => {
    try {
      const { buildSecurityReport, auditWalletSecurity } = await import('./security.js');
      const report = buildSecurityReport();
      const wallet = auditWalletSecurity();
      const walletLine = wallet.passed ? 'ok' : 'issues: ' + (wallet.issues || []).join(', ');
      await sendMessageDetailed(report + '\n\nWallet: ' + walletLine, config.telegramChatId);
    } catch (e) { error('daily_security', e.message); }
  }, 24 * 60 * 60 * 1000);

  // اكتشاف منصات جديدة يومي
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

  // البحث اليومي
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

  // البحث الأسبوعي
  if (process.env.WEEKLY_RESEARCH_ENABLED !== 'false') {
    setInterval(async () => {
      try {
        await import('./research.js').then(module => module.runWeeklyResearch());
      } catch (caught) {
        error('weekly_research', caught.message);
      }
    }, 7 * 24 * 60 * 60_000).unref();
  }
} else {
  info('reports', '⏸ التقارير اليومية معطّلة (DAILY_REPORTS_ENABLED=false)');
}

// ─────────────────────────────────────────────
// الأنظمة الداخلية (تبقى تعمل)
// ─────────────────────────────────────────────
if (process.env.AURORA_AUTOMATION !== 'false') {
  startWalletMonitors();
  startTunnelWatcher();
  startAutomator();
  startOpportunityMonitor();
  startOperations();
  startPrizesReport();
  startProductionMachine();
} else {
  info('platform', '⏸ FULL_STOP: all automated loops disabled (AURORA_AUTOMATION=false)');
}

// ── Kimi Plan: Autonomous Agent System ──
info('platform', '🚀 Starting autonomous agent system (Kimi Plan)...');
startScheduler();
eventBus.on(EVENTS.TASK_SUCCESS, (payload) => {
  initiator.learnFromSuccess(payload.taskId);
});
info('platform', '✅ Scheduler + Initiator + Reporter + EventBus active');

// ── Continuous Production (بعد دقيقتين) ──
setTimeout(async () => {
  try {
    if (process.env.CONTINUOUS_PRODUCTION_ENABLED !== 'false') { await startContinuousProduction(); } else { info('production', 'Continuous production DISABLED by leader instruction'); }
  } catch (e) { error('production', `Continuous production error: ${e.message}`); }
}, 2 * 60 * 1000);

// ── Initial scan (بعد 5 دقائق) ──
setTimeout(async () => {
  try {
    await scanPrizes();
    await discoverPlatforms();
  } catch (e) { error('scanner', `Initial scan error: ${e.message}`); }
}, 5 * 60 * 1000);

// Heartbeat (داخلي)
if (process.env.AURORA_AUTOMATION !== 'false') {
  setInterval(async () => {
    try {
      const { runHeartbeat } = await import('./task-queue.js');
      const result = await runHeartbeat();
      info('heartbeat', `heartbeat ok: task=${result.executed} queue=${result.queue.pending}`);
    } catch (caught) {
      error('heartbeat', caught.message);
    }
  }, 5 * 60 * 1000);
} else {
  info('platform', '⏸ FULL_STOP: heartbeat disabled (AURORA_AUTOMATION=false)');
}

// SQLite maintenance (كل 7 أيام)
setInterval(async () => {
  try {
    const { db } = await import('./db.js');
    const integrity = db.prepare('PRAGMA integrity_check').get();
    info('maintenance', `SQLite integrity: ${integrity?.integrity_check || ''}`);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec('VACUUM;');
    info('maintenance', 'SQLite VACUUM completed');
  } catch (caught) {
    error('maintenance', caught.message);
  }
}, 7 * 24 * 60 * 60_000).unref();

// Render keepalive
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL || 'https://silent-giants-render-backup.onrender.com';
  fetch(`${url}/health`).catch(() => {});
}, 10 * 60 * 1000);

// Mutual keepalive
const peerUrl = process.env.PEER_KEEPALIVE_URL;
if (peerUrl) {
  info('platform', `mutual keepalive active -> ${peerUrl}`);
  setInterval(() => {
    fetch(peerUrl).catch(() => {});
  }, 5 * 60 * 1000);
} else {
  info('platform', 'PEER_KEEPALIVE_URL not set — mutual keepalive disabled');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    info('platform', `${signal} stopped; stopping`);
    server.close(() => process.exit(0));
  });
}
