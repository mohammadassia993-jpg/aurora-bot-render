// security-researcher.js — Continuous Security Guardian (Arabic)
import { generateSecurityReport } from './security-agent-v2.js';
import { info, warn, error } from './logger.js';

const SCAN_INTERVAL_MS = 60 * 60 * 1000;
const DAILY_REPORT_HOUR = 9;
const INITIAL_DELAY_MS = 2 * 60 * 1000;

let lastReport = null;
let lastDailyReportDay = null;

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') {
      await mod.sendMessageDetailed(text);
      return true;
    }
  } catch (e) { warn('security-guardian', 'telegram failed: ' + e.message); }
  return false;
}

function buildAlert(report) {
  return '🚨 تنبيه أمني عاجل\n' +
    '⏰ الوقت: ' + new Date().toISOString() + '\n' +
    '⚠️ عدد الملاحظات: ' + ((report.summary && report.summary.issues) || 0) + '\n\n' +
    String(report.report || '').slice(0, 3500);
}

function buildDailyReport(report) {
  return '📊 التقرير الأمني اليومي\n' +
    '⏰ الوقت: ' + new Date().toISOString() + '\n' +
    '🔒 الحالة: ' + (((report.summary && report.summary.issues) || 0) === 0 ? '✅ آمن' : ('⚠️ ' + report.summary.issues + ' ملاحظة')) + '\n\n' +
    String(report.report || '').slice(0, 3500);
}

async function scanAndAct(isDaily) {
  try {
    const result = await generateSecurityReport();
    lastReport = { at: new Date().toISOString(), summary: result.summary, report: result.report };
    const issues = (result.summary && result.summary.issues) || 0;
    if (issues > 0) {
      await sendToTelegram(buildAlert(result));
      info('security-guardian', 'ALERT sent: ' + issues + ' issues');
      return result;
    }
    if (isDaily) {
      await sendToTelegram(buildDailyReport(result));
      info('security-guardian', 'Daily report sent (SAFE)');
    } else {
      info('security-guardian', 'Hourly scan: SAFE');
    }
    return result;
  } catch (e) {
    error('security-guardian', 'scan failed: ' + e.message);
    return null;
  }
}

async function hourlyTick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isDaily = now.getHours() === DAILY_REPORT_HOUR && lastDailyReportDay !== today;
  if (isDaily) lastDailyReportDay = today;
  await scanAndAct(isDaily);
}

export function getLastReport() { return lastReport; }
export async function runNow() { return await scanAndAct(false); }

export function startSecurityGuardian() {
  setTimeout(function() {
    hourlyTick().catch(function(e) { error('security-guardian', e.message); });
    setInterval(function() {
      hourlyTick().catch(function(e) { error('security-guardian', e.message); });
    }, SCAN_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS).unref();
  info('security-guardian', 'Started: hourly scan, daily report at ' + DAILY_REPORT_HOUR + ':00');
}
