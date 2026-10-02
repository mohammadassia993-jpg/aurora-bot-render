// ai.js — Cloudflare + Hugging Face
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS = ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'];

const metrics = new Map();
const trackOk = m => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.ok++; x.lastErr=''; metrics.set(m,x); };
const trackFail = (m,e) => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.fail++; x.lastErr=String(e||'').slice(0,200); metrics.set(m,x); };

async function callCF(messages, options = {}) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error('CF env missing');
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_MODEL}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
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
    const text = data?.result?.response;
    if (!text) throw new Error('CF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callHF(model, messages, options = {}) {
  if (!HF_TOKEN) throw new Error('HF_TOKEN missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(HF_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + HF_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: options.maxTokens || 800, temperature: 0.2, stream: false }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('HF ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('HF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel() { return 'cloudflare'; }

export function availableModels() {
  return [
    { name: 'cloudflare', model: CF_MODEL, role: 'primary' },
    ...HF_MODELS.map(m => ({ name: 'huggingface', model: m, role: 'fallback' }))
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const wantJson = options.noJsonMode === false;
  const messages = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }, { role: 'user', content: String(prompt || '') }]
    : [{ role: 'user', content: String(prompt || '') }];
  const errors = [];

  if (CF_ACCOUNT && CF_TOKEN) {
    try {
      const r = await callCF(messages, options);
      trackOk('cf:' + CF_MODEL);
      console.log('[ai] success with cloudflare');
      return r;
    } catch (e) {
      trackFail('cf:' + CF_MODEL, e.message);
      console.error('[ai] cloudflare failed: ' + e.message);
      errors.push('CF: ' + e.message.slice(0, 100));
    }
  }

  for (const model of HF_MODELS) {
    try {
      const r = await callHF(model, messages, options);
      trackOk('hf:' + model);
      console.log('[ai] success with HF ' + model);
      return r;
    } catch (e) {
      trackFail('hf:' + model, e.message);
      errors.push('HF:' + model + ': ' + e.message.slice(0, 80));
    }
  }
  throw new Error('All AI providers failed → ' + errors.join(' | '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr };
  return out;
}
