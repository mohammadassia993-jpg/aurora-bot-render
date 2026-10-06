// cost-alerts.js — Monitors AI provider usage and alerts at thresholds
import { db } from './db.js';
import { info, warn, error } from './logger.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const ALERT_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;

const DAILY_LIMITS = {
  zai: 1000,
  llm7: 500,
  huggingface: 50
};

let lastAlertDay = {};

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') {
      await mod.sendMessageDetailed(text);
      return true;
    }
  } catch (e) { warn('cost-alerts', 'telegram failed: ' + e.message); }
  return false;
}

async function checkUsage() {
  try {
    const rows = db.prepare(`
      SELECT provider, COUNT(*) as total
      FROM ai_usage
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY provider
    `).all();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    for (const row of rows) {
      const provider = row.provider;
      const used = row.total;
      const limit = DAILY_LIMITS[provider];
      if (!limit) continue;
      const percent = Math.round((used / limit) * 100);
      const alertKey = provider + ':' + today;
      if (percent >= CRITICAL_THRESHOLD && lastAlertDay[alertKey] !== 'critical') {
        lastAlertDay[alertKey] = 'critical';
        await sendToTelegram(
          '🚨 تنبيه حرج — مزود AI على وشك النفاد\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          'المزود: ' + provider + '\n' +
          'الاستهلاك: ' + used + '/' + limit + ' (' + percent + '%)\n' +
          '⏰ خلال ساعات قد يتوقف الفريق.\n' +
          '💡 الحل: تقليل المهام غير الضرورية أو الانتظار حتى تجديد الحصة.'
        );
        info('cost-alerts', 'CRITICAL alert sent for ' + provider + ' (' + percent + '%)');
      } else if (percent >= ALERT_THRESHOLD && !lastAlertDay[alertKey]) {
        lastAlertDay[alertKey] = 'warning';
        await sendToTelegram(
          '⚠️ تحذير — استهلاك AI مرتفع\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          'المزود: ' + provider + '\n' +
          'الاستهلاك: ' + used + '/' + limit + ' (' + percent + '%)\n' +
          '💡 الحصة كافية حالياً، لكن انتبه للاستهلاك.'
        );
        info('cost-alerts', 'Warning alert sent for ' + provider + ' (' + percent + '%)');
      }
    }
  } catch (e) {
    error('cost-alerts', 'check failed: ' + e.message);
  }
}

export function startCostAlerts() {
  info('cost-alerts', 'Started: checks every 30 minutes, alerts at ' + ALERT_THRESHOLD + '% and ' + CRITICAL_THRESHOLD + '%');
  setTimeout(function() {
    checkUsage().catch(function(e) { error('cost-alerts', e.message); });
    setInterval(function() {
      checkUsage().catch(function(e) { error('cost-alerts', e.message); });
    }, CHECK_INTERVAL_MS).unref();
  }, 60 * 1000).unref();
}

export async function runNow() { return await checkUsage(); }
