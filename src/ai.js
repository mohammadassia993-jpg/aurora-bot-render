// ai.js — Z.ai primary + LLM7 + HF, with cost tracking
import { recordUsage } from './cost-governor.js';

const ZAI_KEY = process.env.ZAI_API_KEY || '';
const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const ZAI_MODEL = 'glm-4.5-flash';

const LLM7_KEY = process.env.LLM7_API_KEY || '';
const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODEL = 'DeepSeek-V4-Flash-1';

const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS = ['meta-llama/Llama-3.3-70B-Instruct'];

const metrics = new Map();
const trackOk = m => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.ok++; x.lastErr=''; metrics.set(m,x); };
const trackFail = (m,e) => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.fail++; x.lastErr=String(e||'').slice(0,200); metrics.set(m,x); };

async function callZAI(messages, options = {}) {
  if (!ZAI_KEY) throw new Error('ZAI_API_KEY missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(ZAI_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ZAI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ZAI_MODEL, messages, max_tokens: options.maxTokens || 800, temperature: 0.2 }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('ZAI ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('ZAI empty');
    return String(text);
  } finally { clearTimeout(t); }
}

async function callLLM7(messages, options = {}) {
  if (!LLM7_KEY) throw new Error('LLM7_API_KEY missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(LLM7_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + LLM7_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM7_MODEL, messages, max_tokens: options.maxTokens || 800, temperature: 0.2 }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) throw new Error('LLM7 ' + res.status + ': ' + raw.slice(0, 200));
    const data = JSON.parse(raw);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('LLM7 empty');
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
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('HF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel() { return 'zai'; }

export function availableModels() {
  return [
    { name: 'zai', model: ZAI_MODEL, role: 'primary' },
    { name: 'llm7', model: LLM7_MODEL, role: 'secondary' },
    ...HF_MODELS.map(m => ({ name: 'huggingface', model: m, role: 'tertiary' }))
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const wantJson = options.noJsonMode === false;
  const messages = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }, { role: 'user', content: String(prompt || '') }]
    : [{ role: 'user', content: String(prompt || '') }];
  const errors = [];

  if (ZAI_KEY) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await callZAI(messages, options);
        trackOk('zai'); recordUsage('zai', ZAI_MODEL, true);
        console.log('[ai] success zai');
        return r;
      } catch (e) {
        if (attempt === 1 && String(e.message).includes('empty')) {
          await new Promise(res => setTimeout(res, 800));
          continue;
        }
        trackFail('zai', e.message); recordUsage('zai', ZAI_MODEL, false, e.message);
        errors.push('ZAI:' + e.message.slice(0,80));
        console.error('[ai] ZAI failed:', e.message);
        break;
      }
    }
  }

  if (LLM7_KEY) {
    try {
      const r = await callLLM7(messages, options);
      trackOk('llm7'); recordUsage('llm7', LLM7_MODEL, true);
      console.log('[ai] success llm7'); return r;
    } catch (e) {
      trackFail('llm7', e.message); recordUsage('llm7', LLM7_MODEL, false, e.message);
      errors.push('LLM7:' + e.message.slice(0,80)); console.error('[ai] LLM7 failed:', e.message);
    }
  }

  for (const model of HF_MODELS) {
    try {
      const r = await callHF(model, messages, options);
      trackOk('hf:' + model); recordUsage('huggingface', model, true);
      console.log('[ai] success HF'); return r;
    } catch (e) {
      trackFail('hf:' + model, e.message); recordUsage('huggingface', model, false, e.message);
      errors.push('HF:' + e.message.slice(0,80));
    }
  }

  throw new Error('All AI providers failed → ' + errors.join(' | '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr };
  return out;
}
