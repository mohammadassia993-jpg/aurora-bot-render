import os from 'node:os';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { db, recordError, resolveLatestError } from './db.js';
import { info, warn } from './logger.js';
import { telegramRequest, telegramTokenHealth } from './telegram-api.js';

const STATE_FILE = path.join(config.root, 'data', 'health-state.json');
const ALERT_COOLDOWN_MIN = 15;
const EMAIL_STALE_MIN = 12;

function loadState() {
  try {
    return JSON.parse(fsSync.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let lastState = loadState();

function persistState() {
  try {
    fsSync.writeFileSync(STATE_FILE, JSON.stringify(lastState, null, 2), { mode: 0o600 });
  } catch (caught) {
    warn('watchdog', `state persist failed: ${caught.message}`);
  }
}

async function fetchOk(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response.ok;
  } finally {
    clearTimeout(timer);
  }
}

function saveCheck(component, healthy, detail, action = '') {
  db.prepare('INSERT INTO health_checks(component, healthy, detail, action) VALUES (?, ?, ?, ?)')
    .run(component, healthy ? 1 : 0, String(detail).slice(0, 1000), action);
}

export async function notifyHealthChange(component, healthy, detail, action, recovered) {
  if (!config.telegramToken || !config.telegramChatId) return { sent: false, reason: 'no token/chat' };
  const emoji = recovered ? '✅' : '🚨';
  const title = recovered ? `استعاد ${component} عافيته` : `عطل في ${component}`;
  const text = [
    `${emoji} ${title}`,
    `التفاصيل: ${detail || '-'}`,
    action ? `الإجراء: ${action}` : '',
    `الوقت: ${new Date().toISOString()}`
  ].filter(Boolean).join('\n');
  try {
    const response = await telegramRequest(config.telegramToken, 'sendMessage', { chat_id: config.telegramChatId, text }, 15000);
    if (response.ok && response.data?.ok) {
      info('watchdog', 'ALERT_SENT', { component, recovered: Boolean(recovered), messageId: response.data.result.message_id });
      return { sent: true, messageId: response.data.result.message_id };
    }
    warn('watchdog', `alert send failed: ${response.data?.description || response.status}`);
    return { sent: false, error: response.data?.description || `HTTP_${response.status}` };
  } catch (caught) {
    warn('watchdog', `alert send error: ${caught.message}`);
    return { sent: false, error: caught.message };
  }
}

function trackHealth(component, healthy, detail, action) {
  const now = Date.now();
  const prev = lastState[component];
  if (!prev) {
    // Baseline on first run: record state without alerting (avoids startup noise).
    lastState[component] = { healthy, ts: now };
    persistState();
    return;
  }
  if (prev.healthy === healthy) {
    if (!healthy && now - prev.ts > ALERT_COOLDOWN_MIN * 60_000) {
      notifyHealthChange(component, healthy, detail, action, false);
      prev.ts = now;
      persistState();
    }
    return;
  }
  lastState[component] = { healthy, ts: now };
  persistState();
  notifyHealthChange(component, healthy, detail, action, healthy);
}

export async function checkGateway() {
  if (config.platformRole === 'render') {
    saveCheck('gateway', true, 'Local phone gateway is not required on the Render backup');
    return true;
  }
  try {
    const healthy = await fetchOk(`${config.gatewayUrl.replace(/\/$/, '')}/`);
    saveCheck('gateway', healthy, healthy ? 'HTTP OK' : 'Gateway returned an error');
    if (healthy) resolveLatestError('gateway', 'Gateway health restored');
    return healthy;
  } catch (caught) {
    saveCheck('gateway', true, `Gateway unreachable but optional; external AnyClaw manages it (${caught.message})`);
    return true;
  }
}

export async function checkInternet() {
  const endpoints = ['https://cloudflare.com/cdn-cgi/trace', 'https://www.google.com/generate_204', 'https://1.1.1.1/'];
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const healthy = await fetchOk(endpoint, {}, 8000);
        if (healthy) {
          saveCheck('internet', true, 'Connectivity restored');
          resolveLatestError('internet', 'Connectivity restored');
          return true;
        }
        lastError = new Error('endpoint returned error');
      } catch (caught) {
        lastError = caught;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  saveCheck('internet', false, lastError ? lastError.message : 'fetch failed', 'Retry with exponential backoff');
  recordError('internet', lastError && lastError.name === 'AbortError' ? 'NETWORK_TIMEOUT' : (lastError?.code || 'NETWORK_DOWN'), lastError ? lastError.message : 'fetch failed', {}, 'Exponential retry');
  return false;
}

export async function checkTelegram() {
  if (!config.telegramToken) {
    saveCheck('telegram', true, 'Disabled because TELEGRAM_BOT_TOKEN is empty', 'Add token to enable alerts');
    return true;
  }
  try {
    const healthy = await telegramTokenHealth(config.telegramToken);
    const outgoing = db.prepare(`
      SELECT status, COUNT(*) AS count FROM telegram_outgoing
      WHERE created_at >= datetime('now', '-24 hours') GROUP BY status
    ` ).all().map(item => `${item.status}=${item.count}`).join(',') || 'empty';
    saveCheck('telegram', healthy, healthy ? `Bot token valid; outbox(${outgoing})` : 'Telegram rejected token or proxy unavailable');
    if (healthy) resolveLatestError('telegram', 'Telegram token working');
    return healthy;
  } catch (caught) {
    saveCheck('telegram', false, caught.message, 'Check token/network');
    recordError('telegram', caught.code || 'TELEGRAM_DOWN', caught.message, {}, 'Check token/network');
    return false;
  }
}

export async function checkAiProvider() {
  if (!config.openRouterKey || process.env.AI_PROVIDER === 'local') {
    const reason = process.env.AI_PROVIDER === 'local' ? 'وضع المحاكاة الذكية مطلوب' : 'لا يوجد مفتاح سحابي';
    saveCheck('ai', true, `${reason}; deterministic local generation active`, 'Add a valid OPENROUTER_API_KEY or GEMINI_API_KEY for cloud generation');
    return true;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { authorization: `Bearer ${config.openRouterKey}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (response.ok) {
      saveCheck('ai', true, 'OpenRouter reachable');
      resolveLatestError('ai', 'OpenRouter reachable');
      return true;
    }
    if ([401, 402, 403].includes(response.status)) {
      saveCheck('ai', true, `تم رفض المفتاح السحابي؛ المحاكاة الذكية الآمنة نشطة`, 'Replace OPENROUTER_API_KEY');
      recordError('ai', 'AI_KEY_REJECTED', `OpenRouter returned ${response.status}`, {}, 'Safe local fallback activated');
      return true;
    }
    saveCheck('ai', false, `OpenRouter HTTP ${response.status}`, 'Retry with backoff');
    recordError('ai', 'AI_HTTP', `OpenRouter returned ${response.status}`, {}, 'Retry with backoff');
    return false;
  } catch (caught) {
    saveCheck('ai', false, caught.message, 'Switch provider or apply backoff');
    recordError('ai', caught.name === 'AbortError' ? 'AI_TIMEOUT' : (caught.code || 'AI_DOWN'), caught.message, {}, 'Backoff and switch provider');
    return false;
  }
}

let emailSelfHealBusy = false;

async function runEmailCheck() {
  if (emailSelfHealBusy) return { ok: false, error: 'already running' };
  emailSelfHealBusy = true;
  const finish = (value) => { emailSelfHealBusy = false; return value; };
  return new Promise((resolvePromise) => {
    const scriptPath = path.join(config.root, 'scripts', 'check-email-inbox.js');
    let child;
    try {
      child = spawn('node', [scriptPath], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (caught) {
      resolvePromise(finish({ ok: false, error: caught.message }));
      return;
    }
    child.on('error', caught => resolvePromise(finish({ ok: false, error: caught.message })));
    child.on('close', code => resolvePromise(finish({ ok: code === 0 })));
    setTimeout(() => { try { child.kill(); } catch { /* noop */ } resolvePromise(finish({ ok: false, error: 'timeout' })); }, 45000);
  });
}

export async function checkEmail() {
  const logPath = path.join(config.root, 'logs', 'email-check.log');
  const ageMinutes = async () => {
    try {
      const stats = await fs.stat(logPath);
      return (Date.now() - stats.mtimeMs) / 60000;
    } catch {
      return Infinity;
    }
  };
  let age = await ageMinutes();
  if (age > EMAIL_STALE_MIN) {
    info('watchdog', 'email check stale; triggering self-heal run');
    const run = await runEmailCheck();
    age = await ageMinutes();
    if (!run.ok && age > EMAIL_STALE_MIN) {
      saveCheck('email', false, `self-heal failed: ${run.error || 'script error'}; last check ${Math.round(age)} min ago`, 'تحقق من إعدادات IMAP/كلمة مرور التطبيق');
      recordError('email', 'EMAIL_CHECK_STALLED', `last check ${Math.round(age)} min ago`, {}, 'Self-heal rerun next cycle');
      return false;
    }
  }
  if (age <= EMAIL_STALE_MIN) {
    saveCheck('email', true, `آخر فحص بريد قبل ${Math.round(age)} دقيقة`);
    resolveLatestError('email', 'Email monitoring active');
    return true;
  }
  saveCheck('email', false, `لا يوجد سجل فحص بريد`, 'تفعيل مراقبة البريد');
  recordError('email', 'EMAIL_CHECK_STALLED', 'no log file', {}, 'Enable email monitoring');
  return false;
}

export async function checkChannel() {
  const chatTarget = config.telegramChannelUsername
    ? `@${config.telegramChannelUsername.replace(/^@/, '')}`
    : config.telegramChannelId;
  if (!config.telegramToken || !chatTarget) {
    saveCheck('channel', true, 'لم تُهيأ قناة Telegram بعد (TELEGRAM_CHANNEL_ID/USERNAME)', 'إنشاء القناة وإضافة البوت');
    return true;
  }
  try {
    const response = await telegramRequest(config.telegramToken, 'getChat', { chat_id: chatTarget }, 8000);
    const healthy = Boolean(response.ok && response.data?.ok);
    saveCheck('channel', healthy, healthy ? 'القناة متاحة' : (response.data?.description || 'فشل الوصول للقناة'), healthy ? '' : 'أعد إضافة البوت كمسؤول في القناة');
    if (healthy) resolveLatestError('channel', 'Channel reachable');
    else recordError('channel', 'CHANNEL_UNAVAILABLE', response.data?.description || 'getChat failed', {}, 'Check bot admin rights');
    return healthy;
  } catch (caught) {
    saveCheck('channel', false, caught.message, 'تحقق من صلاحيات البوت في القناة');
    recordError('channel', 'CHANNEL_DOWN', caught.message, {}, 'Check bot admin rights');
    return false;
  }
}

export function checkResources() {
  const freeMemoryMb = Math.round(os.freemem() / 1024 / 1024);
  const memoryHealthy = freeMemoryMb > 100;
  saveCheck('memory', memoryHealthy, `${freeMemoryMb} MB free`, memoryHealthy ? '' : 'Pause heavy jobs');
  return memoryHealthy;
}

export async function checkDisk() {
  try {
    const stats = await fs.statfs(config.root);
    const freeMb = Math.round((stats.bavail * stats.bsize) / 1024 / 1024);
    const healthy = freeMb > 200;
    saveCheck('disk', healthy, `${freeMb} MB free`, healthy ? '' : 'Clean old logs/backups');
    return healthy;
  } catch (caught) {
    saveCheck('disk', false, caught.message, '');
    return false;
  }
}

export async function runWatchdog() {
  const results = {
    gateway: await checkGateway(),
    internet: await checkInternet(),
    telegram: await checkTelegram(),
    ai: await checkAiProvider(),
    email: await checkEmail(),
    channel: await checkChannel(),
    memory: checkResources(),
    disk: await checkDisk()
  };
  const details = {
    gateway: 'بوابة الاتصال الداخلية',
    internet: 'الاتصال بالإنترنت',
    telegram: 'البوت / تليجرام',
    ai: 'مزوّد الذكاء الاصطناعي',
    email: 'مراقبة البريد',
    channel: 'قناة Telegram',
    memory: 'الذاكرة',
    disk: 'مساحة القرص'
  };
  const actions = {
    gateway: 'إعادة تشغيل خدمة البوابة',
    internet: 'التحقق من الشبكة وإعادة المحاولة',
    telegram: 'فحص التوكن/الشبكة وإعادة المحاولة',
    ai: 'تبديل المزوّد أو تطبيق مهلة',
    email: 'إعادة تفعيل فحص البريد الذاتي',
    channel: 'إعادة إضافة البوت كمسؤول بالقناة',
    memory: 'إيقاف المهام الثقيلة مؤقتاً',
    disk: 'تنظيف السجلات والنسخ القديمة'
  };
  for (const [key, healthy] of Object.entries(results)) {
    trackHealth(key, healthy, details[key] || key, healthy ? '' : (actions[key] || ''));
  }
  info('watchdog', 'health cycle complete', results);
  return results;
}
