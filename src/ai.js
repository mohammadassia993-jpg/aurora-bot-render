// ai.js — Cloudflare Workers AI + LLM7
import { config } from './config.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODEL = 'gpt-4o-mini';

const metrics = new Map();

function trackOk(name) {
  const m = metrics.get(name) || { ok: 0, fail: 0, lastErr: '', blockedUntil: 0 };
  m.ok++; m.blockedUntil = 0; m.lastErr = '';
  metrics.set(name, m);
}

function trackFail(name, err) {
  const m = metrics.get(name) || { ok: 0, fail: 0, lastErr: '', blockedUntil: 0 };
  m.fail++;
  m.lastErr = String(err || '').slice(0, 300);
  if (m.fail % 3 === 0) m.blockedUntil = Date.now() + 60000;
  metrics.set(name, m);
}

function isBlocked(name) {
  const m = metrics.get(name);
  return m && m.blockedUntil > Date.now();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function callCloudflare(messages, options = {}) {
  if (!CF_ACCOUNT_ID) throw new Error('CF_ACCOUNT_ID missing in env');
  if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN missing in env');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/run/' + CF_MODEL;
  const body = { messages, max_tokens: options.maxTokens || 1024 };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const rawText = await res.text();
    if (!res.ok) throw new Error('CF HTTP ' + res.status + ': ' + rawText.slice(0, 300));
    let data;
    try { data = JSON.parse(rawText); } catch { throw new Error('CF bad JSON: ' + rawText.slice(0, 200)); }
    if (!data.success) throw new Error('CF not success: ' + JSON.stringify(data.errors || data).slice(0, 300));
    const text = (data.result && (data.result.response || data.result.output_text)) || '';
    if (!text) throw new Error('CF empty. keys: ' + Object.keys(data.result || {}).join(','));
    return String(text);
  } finally { clearTimeout(t); }
}

export async function callLLM7(messages, options = {}) {
  const body = { model: LLM7_MODEL, messages };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(LLM7_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const rawText = await res.text();
    if (!res.ok) throw new Error('LLM7 HTTP ' + res.status + ': ' + rawText.slice(0, 300));
    let data;
    try { data = JSON.parse(rawText); } catch { throw new Error('LLM7 bad JSON: ' + rawText.slice(0, 200)); }
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!text) throw new Error('LLM7 empty: ' + rawText.slice(0, 200));
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel(agent) { return 'cloudflare'; }

export function availableModels() {
  return [
    { name: 'cloudflare', model: CF_MODEL, role: 'primary' },
    { name: 'llm7', model: LLM7_MODEL, role: 'fallback' }
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const messages = [{ role: 'user', content: String(prompt || '') }];
  const providers = ['cloudflare', 'llm7'];
  const errors = [];

  for (const name of providers) {
    if (isBlocked(name)) { errors.push(name + ': BLOCKED'); continue; }
    try {
      const fn = name === 'cloudflare' ? callCloudflare : callLLM7;
      const result = await fn(messages, options);
      trackOk(name);
      return result;
    } catch (e) {
      trackFail(name, e.message);
      errors.push(name + ': ' + e.message);
      console.error('[ai] ' + name + ' failed: ' + e.message);
      await sleep(300);
    }
  }
  throw new Error('All providers failed → ' + errors.join(' || '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) {
    out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr, blocked: m.blockedUntil > Date.now() };
  }
  return out;
}
