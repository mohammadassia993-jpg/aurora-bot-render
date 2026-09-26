// ai.js — Cloudflare (أساسي) + LLM7 (احتياطي بدون response_format)
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODELS = ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat'];

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

async function callCloudflare(messages, options = {}) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('CF credentials missing');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/v1/chat/completions';
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no explanation.' }].concat(messages)
    : messages;
  const body = {
    model: CF_MODEL,
    messages: msgs,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature !== undefined ? options.temperature : 0.3
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
    const rawText = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + rawText.slice(0, 200));
    const data = JSON.parse(rawText);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callLLM7(messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no explanation.' }].concat(messages)
    : messages;

  const errors = [];
  for (const model of LLM7_MODELS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(LLM7_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs }),
        signal: ctrl.signal
      });
      const rawText = await res.text();
      if (!res.ok) { errors.push(model + ': HTTP ' + res.status); continue; }
      const data = JSON.parse(rawText);
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (text) return String(text);
      errors.push(model + ': empty');
    } catch (e) {
      errors.push(model + ': ' + e.message.slice(0, 60));
    } finally { clearTimeout(t); }
  }
  throw new Error('LLM7 all failed: ' + errors.join(' | '));
}

export function selectModel() { return 'cloudflare'; }

export function availableModels() {
  return [
    { name: 'cloudflare', model: CF_MODEL, role: 'primary' },
    { name: 'llm7', model: LLM7_MODELS[0], role: 'fallback' }
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
      errors.push(name + ': ' + e.message.slice(0, 100));
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
