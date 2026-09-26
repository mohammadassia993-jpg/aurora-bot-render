// ai.js — KeylessAI (أساسي مجاني بلا مفتاح) + Pollinations (احتياطي)
const KEYLESS_URL = 'https://keylessai.thryx.workers.dev/v1/chat/completions';
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';

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
  if (m.fail % 3 === 0) m.blockedUntil = Date.now() + 30000;
  metrics.set(name, m);
}

function isBlocked(name) {
  const m = metrics.get(name);
  return m && m.blockedUntil > Date.now();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══ KeylessAI (أساسي — لا يحتاج مفتاح) ═══
async function callKeyless(messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no explanation.' }].concat(messages)
    : messages;

  const body = {
    model: 'gpt-4o',
    messages: msgs,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature !== undefined ? options.temperature : 0.3
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(KEYLESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Keyless HTTP ' + res.status + ': ' + errText.slice(0, 200));
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Keyless empty response');
    return String(text);
  } finally { clearTimeout(t); }
}

// ═══ Pollinations (احتياطي) ═══
async function callPollinations(messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no explanation.' }].concat(messages)
    : messages;

  const body = {
    model: 'mistral',
    messages: msgs,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature !== undefined ? options.temperature : 0.3
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(POLLINATIONS_URL + '?referrer=silent-giants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Pollinations HTTP ' + res.status + ': ' + errText.slice(0, 200));
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Pollinations empty response');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel() { return 'keyless'; }

export function availableModels() {
  return [
    { name: 'keyless', model: 'gpt-4o', role: 'primary' },
    { name: 'pollinations', model: 'mistral', role: 'fallback' }
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const messages = [{ role: 'user', content: String(prompt || '') }];
  const providers = ['keyless', 'pollinations'];
  const errors = [];

  for (const name of providers) {
    if (isBlocked(name)) { errors.push(name + ': BLOCKED'); continue; }
    try {
      const fn = name === 'keyless' ? callKeyless : callPollinations;
      const result = await fn(messages, options);
      trackOk(name);
      return result;
    } catch (e) {
      trackFail(name, e.message);
      errors.push(name + ': ' + e.message.slice(0, 120));
      await sleep(500);
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
