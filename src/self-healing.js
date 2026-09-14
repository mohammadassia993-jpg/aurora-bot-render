/**
 * self-healing.js — Self-Healing Loop
 *
 * Classifies task failures and decides the recovery path:
 *   - transient   : retry up to 3 times with backoff
 *   - permanent   : log once, move to fallback task
 *   - environmental: log + move to fallback task (no unauthorized bypass)
 *
 * Every failure is written to logs/failures.log and surfaced to git state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { info, warn, error as errorLog } from './logger.js';

const FAILURES_LOG = path.join(config.root, 'logs', 'failures.log');
const RETRY_DELAYS_MS = [5000, 15000, 60000];

export function classifyError(caught) {
  const status = Number(caught?.status || caught?.code || 0);
  const message = String(caught?.message || caught || '').toLowerCase();

  if (/captcha|waf|turnstile|aws waf|human verification|rate.?limit|429/i.test(message)) {
    return 'environmental';
  }
  if (status === 404 || status === 401 || status === 403 || /not found|unauthorized|forbidden/i.test(message)) {
    return 'permanent';
  }
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504 ||
      /timed? ?out|network|econnreset|econnrefused|socket|fetch failed|aborted/i.test(message)) {
    return 'transient';
  }
  return 'permanent';
}

export function appendFailureLog(entry) {
  try {
    fs.mkdirSync(path.dirname(FAILURES_LOG), { recursive: true });
    fs.appendFileSync(FAILURES_LOG, JSON.stringify(entry) + '\n');
  } catch {
    /* log rotation handled externally */
  }
}

export async function runWithHealing(task, {
  scope = 'task',
  onFallback
} = {}) {
  let lastError;
  let attempts = 0;

  while (attempts <= RETRY_DELAYS_MS.length) {
    try {
      const result = await task(attempts);
      info('self-healing', `${scope} succeeded on attempt ${attempts + 1}`);
      appendFailureLog({
        time: new Date().toISOString(),
        scope,
        outcome: 'ok',
        attempts: attempts + 1
      });
      return { ok: true, result, attempts: attempts + 1 };
    } catch (caught) {
      lastError = caught;
      attempts += 1;
      const kind = classifyError(caught);
      appendFailureLog({
        time: new Date().toISOString(),
        scope,
        outcome: 'failed',
        kind,
        attempts,
        message: String(caught?.message || caught).slice(0, 500)
      });

      if (kind === 'transient' && attempts <= RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempts - 1];
        warn('self-healing', `${scope} transient failure (${attempts}), retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      errorLog('self-healing', `${scope} ${kind} failure — moving to fallback`, {
        message: String(caught?.message || caught).slice(0, 300)
      });
      if (onFallback) await onFallback(lastError, kind);
      return { ok: false, kind, error: lastError, attempts };
    }
  }

  return { ok: false, kind: 'permanent', error: lastError, attempts };
}

export default runWithHealing;
