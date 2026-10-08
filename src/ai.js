// ai.js — Pollinations (primary, no key) + Z.ai + NagaAI + Cloudflare + HF
// Env vars: ZAI_API_KEY, NAGAAI_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, HF_TOKEN

import { recordUsage } from './cost-governor.js';
import { classifyTask, selectModelForTask } from './model-router.js';

// ============ Pollinations (GET endpoint — لا يحتاج مفتاحاً) ============
const POLL_BASE = 'https://text.pollinations.ai';
const POLL_MODEL = 'openai';

const ZAI_KEY = process.env.ZAI_API_KEY || '';
const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZAI_MODEL = 'glm-4.5-flash';

const NAGA_KEY = process.env.NAGAAI_API_KEY || '';
const NAGA_URL = 'https://api.naga.ac/v1/chat/completions';
const NAGA_MODEL = 'llama-3.3-70b-instruct:free';

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS = ['meta-llama/Llama-3.3-70B-Instruct'];

const DEFAULT_MAX_TOKENS = 12000;

const metrics = new Map();
const trackOk = m => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.ok++; x.lastErr=''; metrics.set(m,x); };
const trackFail = (m,e) => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.fail++; x.lastErr=String(e||'').slice(0,200); metrics.set(m,x); };

// ============ Pollinations (GET) ============
async function callPollinations(messages, options = {}) {
  let system = '';
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') system = msg.content;
    else if (msg.role === 'user') prompt = prompt ? (prompt + '\n\n' + msg.content) : msg.content;
    else if (msg.role === 'assistant') prompt += '\n\nAssistant: ' + msg.content;
  }
  if (!prompt) throw new Error('Pollinations: no user prompt');

  const params = new URLSearchParams();
  params.set('model', options.model || POLL_MODEL);
  params.set('temperature', String(options.temperature !== undefined ? options.temperature : 0.7));
  if (system) params.set('system', system);
  if (options.json) params.set('json', 'true');

  const url = POLL_BASE + '/' + encodeURIComponent(prompt) + '?' + params.toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const raw = await res.text();
    if (!res.ok) throw new Error('Pollinations ' + res.status + ': ' + raw.slice(0, 200));
    if (!raw || raw.length < 2) throw new Error('Pollinations empty');
    return raw;
  } finally { clearTimeout(t); }
}

// ============ Z.AI ============
async function callZAI(messages, options = {}) {
  if (!ZAI_KEY) throw new Error('ZAI_API_KEY missing');
  const body = {
    model: options.model || ZAI_MODEL,
    messages,
    max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: options.temperature !== undefined ? options.temperature : 0.2,
    thinking: { type: 'disabled' }
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(ZAI_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ZAI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('ZAI ' + res.status + ': ' + raw.slice(0, 250));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('ZAI empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callZAIWithFallback(messages, options) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await callZAI(messages, { ...options, model: ZAI_MODEL });
      console.log('[ai] ZAI success (attempt ' + (attempt+1) + ')');
      return { text: r, model: ZAI_MODEL };
    } catch (e) {
      lastErr = e;
      console.warn('[ai] ZAI attempt ' + (attempt+1) + ' failed: ' + String(e.message).slice(0,150));
      if (String(e.message).includes('429')) break;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr || new Error('ZAI all attempts failed');
}

async function callNagaAI(messages, options = {}) {
  if (!NAGA_KEY) throw new Error('NAGAAI_API_KEY missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(NAGA_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + NAGA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || NAGA_MODEL,
        messages,
        max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: options.temperature !== undefined ? options.temperature : 0.2,
        stream: false
      }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('NagaAI ' + res.status + ': ' + raw.slice(0, 250));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('NagaAI empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callCF(messages, options = {}) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error('CF env missing');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT + '/ai/run/' + CF_MODEL;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: options.maxTokens || 800, temperature: 0.2 }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('CF ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data && data.result && data.result.response;
    if (!text) throw new Error('CF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callHF(model, messages, options = {}) {
  if (!HF_TOKEN) throw new Error('HF_TOKEN missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(HF_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + HF_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS, temperature: 0.2, stream: false }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('HF ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('HF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel() { return 'pollinations-router'; }

export function availableModels() {
  return [
    { name: 'pollinations', model: POLL_MODEL, role: 'primary' },
    { name: 'zai', model: ZAI_MODEL, role: 'secondary' },
    { name: 'nagaai', model: NAGA_MODEL, role: 'tertiary' },
    { name: 'cloudflare', model: CF_MODEL, role: 'quaternary' },
    ...HF_MODELS.map(m => ({ name: 'huggingface', model: m, role: 'last-resort' }))
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const complexity = options.complexity || classifyTask(prompt, {
    consecutiveFailures: options.failures || 0,
    currentStep: options.step || 1
  });
  const tier = selectModelForTask(complexity);
  console.log('[ai] complexity=' + complexity + ' tier.model=' + tier.model);

  const wantJson = options.noJsonMode === false;
  const messages = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }, { role: 'user', content: String(prompt || '') }]
    : [{ role: 'user', content: String(prompt || '') }];

  const callOpts = {
    maxTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: tier.temperature,
    json: wantJson
  };
  const errors = [];

  // 1. Pollinations
  try {
    const r = await callPollinations(messages, callOpts);
    trackOk('pollinations'); recordUsage('pollinations', POLL_MODEL, true);
    console.log('[ai] Pollinations success');
    return r;
  } catch (e) {
    trackFail('pollinations', e.message);
    recordUsage('pollinations', POLL_MODEL, false, e.message);
    errors.push('Pollinations:' + String(e.message).slice(0,80));
    console.error('[ai] Pollinations failed:', e.message);
  }

  // 2. Z.ai
  try {
    const result = await callZAIWithFallback(messages, callOpts);
    trackOk('zai:' + result.model);
    recordUsage('zai', result.model, true);
    return result.text;
  } catch (e) {
    trackFail('zai:' + ZAI_MODEL, e.message);
    recordUsage('zai', ZAI_MODEL, false, e.message);
    errors.push('ZAI:' + String(e.message).slice(0,80));
    console.error('[ai] ZAI failed:', e.message);
  }

  // 3. NagaAI
  if (NAGA_KEY) {
    try {
      const r = await callNagaAI(messages, callOpts);
      trackOk('nagaai'); recordUsage('nagaai', NAGA_MODEL, true);
      console.log('[ai] NagaAI success');
      return r;
    } catch (e) {
      trackFail('nagaai', e.message);
      recordUsage('nagaai', NAGA_MODEL, false, e.message);
      errors.push('NagaAI:' + String(e.message).slice(0,80));
      console.error('[ai] NagaAI failed:', e.message);
    }
  }

  // 4. Cloudflare
  if (CF_ACCOUNT && CF_TOKEN) {
    try {
      const r = await callCF(messages, callOpts);
      trackOk('cloudflare'); recordUsage('cloudflare', CF_MODEL, true);
      console.log('[ai] CF success');
      return r;
    } catch (e) {
      trackFail('cloudflare', e.message);
      recordUsage('cloudflare', CF_MODEL, false, e.message);
      errors.push('CF:' + String(e.message).slice(0,80));
    }
  }

  // 5. HuggingFace
  for (const model of HF_MODELS) {
    try {
      const r = await callHF(model, messages, callOpts);
      trackOk('hf:' + model); recordUsage('huggingface', model, true);
      return r;
    } catch (e) {
      trackFail('hf:' + model, e.message);
      recordUsage('huggingface', model, false, e.message);
      errors.push('HF:' + String(e.message).slice(0,80));
    }
  }

  throw new Error('All AI providers failed → ' + errors.join(' | '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr };
  return out;
}
