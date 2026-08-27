import os from 'node:os';
import fs from 'node:fs/promises';
import { config } from './config.js';
import { db, recordError, resolveLatestError } from './db.js';
import { info, warn } from './logger.js';
import { telegramTokenHealth } from './telegram-api.js';

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

export async function checkGateway() {
  if (config.platformRole === 'render') {
    saveCheck('gateway', true, 'Local phone gateway is not required on the Render backup');
    return true;
  }
  // The openclaw gateway is managed by the external AnyClaw runtime, not by this
  // supervisor. When it is unreachable, the core platform (telegram/dashboard/tasks)
  // still runs fully, so report it as optional rather than critical.
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
    memory: checkResources(),
    disk: await checkDisk()
  };
  info('watchdog', 'health cycle complete', results);
  return results;
}
