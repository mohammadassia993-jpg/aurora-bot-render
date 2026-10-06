// tool-alerts.js — Alerts when tools fail repeatedly
import { info, warn, error } from './logger.js';

const FAILURE_THRESHOLD = 3;
const RESET_AFTER_MS = 15 * 60 * 1000;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

const failureCount = new Map();
const lastAlertAt = new Map();

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') {
      await mod.sendMessageDetailed(text);
      return true;
    }
  } catch (e) { warn('tool-alerts', 'telegram failed: ' + e.message); }
  return false;
}

export function recordToolFailure(toolName, errorMessage) {
  try {
    const now = Date.now();
    const existing = failureCount.get(toolName) || { count: 0, firstAt: now, lastError: '' };
    if (now - existing.firstAt > RESET_AFTER_MS) {
      existing.count = 0;
      existing.firstAt = now;
    }
    existing.count++;
    existing.lastError = String(errorMessage || '').slice(0, 300);
    failureCount.set(toolName, existing);

    if (existing.count >= FAILURE_THRESHOLD) {
      const lastAlert = lastAlertAt.get(toolName) || 0;
      if (now - lastAlert > ALERT_COOLDOWN_MS) {
        lastAlertAt.set(toolName, now);
        existing.count = 0;
        existing.firstAt = now;
        const msg = '🔧 تنبيه — أداة تفشل بشكل متكرر\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          'الأداة: ' + toolName + '\n' +
          'عدد الإخفاقات: ' + FAILURE_THRESHOLD + ' خلال 15 دقيقة\n' +
          'آخر خطأ: ' + existing.lastError + '\n\n' +
          '💡 الحل:\n' +
          '- تحقق من المعاملات المُرسلة\n' +
          '- أو اختبر الأداة يدوياً عبر shell_exec\n' +
          '- أو تحقق من اللوجات في Render';
        sendToTelegram(msg).catch(function(e) { error('tool-alerts', e.message); });
        info('tool-alerts', 'Alert sent for ' + toolName + ' after ' + FAILURE_THRESHOLD + ' failures');
      }
    }
  } catch (e) {
    error('tool-alerts', 'recordToolFailure failed: ' + e.message);
  }
}

export function getToolFailures() {
  const out = {};
  for (const [tool, data] of failureCount.entries()) {
    out[tool] = { count: data.count, lastError: data.lastError, firstAt: new Date(data.firstAt).toISOString() };
  }
  return out;
}

export function resetToolFailures(toolName) {
  if (toolName) failureCount.delete(toolName);
  else failureCount.clear();
  info('tool-alerts', 'failures reset: ' + (toolName || 'all'));
}

export function startToolAlerts() {
  info('tool-alerts', 'Started: alerts after ' + FAILURE_THRESHOLD + ' consecutive failures, cooldown ' + (ALERT_COOLDOWN_MS / 60000) + 'min');
}
