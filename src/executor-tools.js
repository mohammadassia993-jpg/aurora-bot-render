/**
 * executor-tools.js — Executor's built-in tools (Part 5 of 8)
 *
 * - CAPTCHA solving (CapSolver API)
 * - OTP generation (otpauth library)
 * - IP rotation (proxy service)
 * - SMS verification
 * - Gmail creation (API)
 * - Error/solution logging to memory
 */
import crypto from 'node:crypto';
import { info, warn } from './logger.js';
import { recordLesson, learnFromError, getRecentLessons } from './memory.js';
import { config } from './config.js';

// ── CAPTCHA Solver (CapSolver) ──
const CAPSOLVER_API = 'https://api.capsolver.com';

export async function solveRecaptchaV2(siteKey, pageUrl) {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) return { error: 'CAPSOLVER_API_KEY not set' };

  info('executor-tools', `solving reCAPTCHA v2 for ${pageUrl}`);
  try {
    const createRes = await fetch(`${CAPSOLVER_API}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        task: { type: 'ReCaptchaV2TaskProxyLess', websiteURL: pageUrl, websiteKey: siteKey }
      })
    });
    const createData = await createRes.json();
    if (createData.errorId !== 0) return { error: createData.errorDescription || 'create_failed' };

    const taskId = createData.taskId;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`${CAPSOLVER_API}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId })
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'ready') {
        info('executor-tools', 'CAPTCHA solved successfully');
        return { success: true, token: pollData.solution?.gRecaptchaResponse };
      }
      if (pollData.errorId !== 0) return { error: pollData.errorDescription || 'poll_failed' };
    }
    return { error: 'timeout' };
  } catch (e) {
    learnFromError('executor', null, 'captcha_failed', e.message, 'check API key');
    return { error: e.message };
  }
}

// ── OTP Generator ──
export function generateOTP(secret, period = 30, digits = 6) {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
  hmac.update(counterBuf);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const otp = ((hash[offset] & 0x7f) << 24 |
    (hash[offset + 1] & 0xff) << 16 |
    (hash[offset + 2] & 0xff) << 8 |
    (hash[offset + 3] & 0xff)) % Math.pow(10, digits);

  return String(otp).padStart(digits, '0');
}

export function generateOTPSecret() {
  return crypto.randomBytes(20).toString('base64');
}

export function getOTPTimeRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}

// ── Proxy Rotation ──
let currentProxyIndex = 0;

export function getNextProxy() {
  const proxies = (process.env.PROXY_LIST || '').split(',').filter(Boolean);
  if (!proxies.length) return null;
  const proxy = proxies[currentProxyIndex % proxies.length];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  info('executor-tools', `rotated to proxy: ${proxy.replace(/\/\/.*@/, '//***@')}`);
  return proxy;
}

export function getProxyHeaders() {
  const proxy = getNextProxy();
  if (!proxy) return {};
  const url = new URL(proxy);
  return {
    'X-Forwarded-For': url.hostname,
    'X-Proxy-Auth': url.username || ''
  };
}

// ── SMS Verification ──
export async function requestSMSVerification(service, phoneNumber) {
  const apiKey = process.env.SMS_VERIFY_API_KEY;
  if (!apiKey) return { error: 'SMS_VERIFY_API_KEY not set' };

  info('executor-tools', `requesting SMS verification for ${service}`);
  try {
    const res = await fetch(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getNumber&service=${service}&phone=${phoneNumber}`, {
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    if (text.startsWith('ACCESS_NUMBER:')) {
      const [, id, number] = text.split(':');
      info('executor-tools', `SMS number received: ${number}`);
      return { success: true, id, number };
    }
    return { error: text };
  } catch (e) {
    learnFromError('executor', null, 'sms_verify_failed', e.message);
    return { error: e.message };
  }
}

export async function getSMSCode(id, timeoutMs = 120000) {
  const apiKey = process.env.SMS_VERIFY_API_KEY;
  if (!apiKey) return { error: 'SMS_VERIFY_API_KEY not set' };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getStatus&id=${id}`, {
        signal: AbortSignal.timeout(10000)
      });
      const text = await res.text();
      if (text.includes('STATUS_OK:')) {
        const code = text.split(':')[1];
        info('executor-tools', `SMS code received: ${code}`);
        return { success: true, code };
      }
    } catch { }
    await new Promise(r => setTimeout(r, 5000));
  }
  return { error: 'timeout' };
}

// ── Email Creation (temp mail) ──
export async function createTempEmail() {
  try {
    const res = await fetch('https://api.tempmail.lol/v2/inbox/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    info('executor-tools', `temp email created: ${data.address}`);
    return { success: true, address: data.address, token: data.token };
  } catch (e) {
    return { error: e.message };
  }
}

export async function checkTempEmail(token) {
  try {
    const res = await fetch(`https://api.tempmail.lol/v2/inbox/${token}`, {
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    return { success: true, emails: data.emails || [] };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Error/Solution Logger ──
export function logSolution(agent, taskId, errorType, errorMessage, solution) {
  recordLesson(agent, taskId, 'solution', `sol:${errorType}`, `${errorMessage} → ${solution}`, 1.5);
  info('executor-tools', `solution logged: ${errorType} → ${solution.slice(0, 100)}`);
}

export function findSolutionForError(errorType) {
  const lessons = getRecentLessons('executor', 20);
  const match = lessons.find(l => l.lesson_key.includes(errorType));
  return match ? match.lesson_text : null;
}

// ── Combined Toolset ──
export function getExecutorToolset() {
  return {
    captcha: { solveRecaptchaV2 },
    otp: { generateOTP, generateOTPSecret, getOTPTimeRemaining },
    proxy: { getNextProxy, getProxyHeaders },
    sms: { requestSMSVerification, getSMSCode },
    email: { createTempEmail, checkTempEmail },
    solutions: { logSolution, findSolutionForError }
  };
}

info('executor-tools', 'executor tools loaded', {
  captcha: !!process.env.CAPSOLVER_API_KEY,
  sms: !!process.env.SMS_VERIFY_API_KEY,
  proxy: !!process.env.PROXY_LIST
});
