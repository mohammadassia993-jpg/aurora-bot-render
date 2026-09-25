// ai.js — Cloudflare Workers AI (أساسي) + LLM7 (احتياطي)
import { config } from './config.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODEL = 'gpt-4o-mini';

const metrics = new Map();

function trackOk(name) {
  const m = metrics.get(name) || { ok: 0, fail: 0, lastErr: '', blockedUntil: 0 };
  m.ok++;
  m.blockedUntil = 0;
  m.lastErr = '';
  metrics.set(name, m);
}

function trackFail(name, err) {
  const m = metrics.get(name) || { ok: 0, fail: 0, lastErr: '', blockedUntil: 0 };
  m.fail++;
  m.lastErr = String(err || '').slice(0, 200);
  if (m.fail % 3 === 0) m.blockedUntil = Date.now() + 60000;
  metrics.set(name, m);
}

function isBlocked(name) {
  const m = metrics.get(name);
  return m && m.blockedUntil > Date.now();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callCloudflare(messages, options = {}) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('Cloudflare credentials missing');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/run/' + CF_MODEL;
  const body = {
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature !== undefined ? options.temperature : 0.4
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CF_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('CF ' + res.status + ': ' + errText.slice(0, 200));
    }
    const data = await res.json();
    if (!data.success) throw new Error('CF: ' + JSON.stringify(data.errors || data).slice(0, 200));
    const text = (data.result && (data.result.response || data.result.output_text)) || '';
    if (!text) throw new Error('CF empty response');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callLLM7(messages, options = {}) {
  const body = {
    model: LLM7_MODEL,
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature !== undefined ? options.temperature : 0.4
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(LLM7_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('LLM7 ' + res.status);
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!text) throw new Error('LLM7 empty');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel(agent) {
  const map = {
    aurora: 'cloudflare',
    planner: 'cloudflare',
    executor: 'cloudflare',
    reviewer: 'cloudflare',
    scout: 'cloudflare'
  };
  return map[agent] || 'cloudflare';
}

export function availableModels() {
  return [
    { name: 'cloudflare', model: CF_MODEL, role: 'primary', provider: 'Cloudflare Workers AI' },
    { name: 'llm7', model: LLM7_MODEL, role: 'fallback', provider: 'LLM7' }
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const messages = [{ role: 'user', content: String(prompt || '') }];
  const preferred = selectModel(agent);
  const providers = preferred === 'cloudflare' ? ['cloudflare', 'llm7'] : ['llm7', 'cloudflare'];
  let lastErr = null;

  for (const name of providers) {
    if (isBlocked(name)) {
      console.warn('[ai] ' + name + ' blocked, skipping');
      continue;
    }
    try {
      const fn = name === 'cloudflare' ? callCloudflare : callLLM7;
      const result = await fn(messages, options);
      trackOk(name);
      return result;
    } catch (e) {
      trackFail(name, e.message);
      console.error('[ai] ' + name + ' failed: ' + e.message);
      lastErr = e;
      await sleep(500);
    }
  }
  throw new Error('All providers failed. Last: ' + (lastErr && lastErr.message || 'unknown'));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) {
    out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr, blocked: m.blockedUntil > Date.now() };
  }
  return out;
}
