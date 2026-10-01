// ai.js — Pollinations (endpoint الجديد) + LLM7
const POLLINATIONS_URL = 'https://text.pollinations.ai/v1/chat/completions';
const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODELS = ['gpt-4o', 'gpt-4.1-nano', 'deepseek-chat', 'mistral-small-latest', 'qwen-2.5-72b-instruct'];

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
  if (m.fail % 2 === 0) m.blockedUntil = Date.now() + 20000;
  metrics.set(name, m);
}

function isBlocked(name) {
  const m = metrics.get(name);
  return m && m.blockedUntil > Date.now();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callPollinations(messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown.' }].concat(messages)
    : messages;

  const body = {
    model: 'openai',
    messages: msgs,
    max_tokens: options.maxTokens || 2048,
    referrer: 'silent-giants'
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(POLLINATIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const rawText = await res.text();
    if (!res.ok) throw new Error('Poll ' + res.status + ': ' + rawText.slice(0, 100));
    const data = JSON.parse(rawText);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Poll empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callLLM7(messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only.' }].concat(messages)
    : messages;

  const errors = [];
  for (const model of LLM7_MODELS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(LLM7_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs, max_tokens: options.maxTokens || 2048 }),
        signal: ctrl.signal
      });
      const rawText = await res.text();
      if (!res.ok) { errors.push(model + ':' + res.status); continue; }
      const data = JSON.parse(rawText);
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (text) return String(text);
      errors.push(model + ':empty');
    } catch (e) {
      errors.push(model + ':' + e.message.slice(0, 40));
    } finally { clearTimeout(t); }
  }
  throw new Error('LLM7 all failed: ' + errors.join('|'));
}

export function selectModel() { return 'pollinations'; }

export function availableModels() {
  return [
    { name: 'pollinations', model: 'openai', role: 'primary' },
    { name: 'llm7', model: LLM7_MODELS[0], role: 'fallback' }
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const messages = [{ role: 'user', content: String(prompt || '') }];
  const providers = ['pollinations', 'llm7'];
  const errors = [];

  for (const name of providers) {
    if (isBlocked(name)) { errors.push(name + ':BLOCKED'); continue; }
    try {
      const fn = name === 'pollinations' ? callPollinations : callLLM7;
      const result = await fn(messages, options);
      trackOk(name);
      return result;
    } catch (e) {
      trackFail(name, e.message);
      errors.push(name + ':' + e.message.slice(0, 80));
      await sleep(300);
    }
  }
  throw new Error('All failed → ' + errors.join(' || '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) {
    out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr, blocked: m.blockedUntil > Date.now() };
  }
  return out;
}
