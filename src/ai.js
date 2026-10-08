// ai.js — Pollinations (primary, no key) + Z.ai + NagaAI + Cloudflare + HF
// Env vars: ZAI_API_KEY, NAGAAI_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, HF_TOKEN
// Pollinations needs NO API key

import { recordUsage } from './cost-governor.js';
import { classifyTask, selectModelForTask } from './model-router.js';

// ============ ⬇️ جديد: Pollinations ============
const POLL_URL = 'https://text.pollinations.ai/openai';
const POLL_MODEL = 'openai';
// ============ ⬆️ نهاية الإضافة ============

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

// ============ ⬇️ جديد: دالة Pollinations ============
async function callPollinations(messages, options = {}) {
  const body = {
    model: options.model || POLL_MODEL,
    messages,
    max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    stream: false
  };
  if (options.reasoning) body.reasoning_effort = options.reasoning;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(POLL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('Pollinations ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Pollinations empty');
    return String(text);
  } finally { clearTimeout(t); }
}
// ============ ⬆️ نهاية الإضافة ============

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
    reasoning: complexity === 'complex' ? 'high' : (complexity === 'medium' ? 'medium' : 'low')
  };
  const errors = [];

  // ============ ⬇️ جديد: Pollinations أولاً ============
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
  // ============ ⬆️ نهاية الإضافة ============

  // Z.ai (secondary) — كما كان تماماً
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

  // NagaAI (tertiary) — كما كان تماماً
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

  // Cloudflare (quaternary) — كما كان تماماً
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

  // HuggingFace (last resort) — كما كان تماماً
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
