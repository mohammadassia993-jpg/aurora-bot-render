// ai.js — Hugging Face Inference Providers
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS = [
  'meta-llama/Llama-3.3-70B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'deepseek-ai/DeepSeek-V3-0324',
  'mistralai/Mistral-7B-Instruct-v0.3'
];

const metrics = new Map();

function trackOk(model) {
  const m = metrics.get(model) || { ok: 0, fail: 0, lastErr: '' };
  m.ok++;
  m.lastErr = '';
  metrics.set(model, m);
}

function trackFail(model, err) {
  const m = metrics.get(model) || { ok: 0, fail: 0, lastErr: '' };
  m.fail++;
  m.lastErr = String(err || '').slice(0, 200);
  metrics.set(model, m);
}

async function callHFModel(model, messages, options = {}) {
  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }].concat(messages)
    : messages;

  const body = {
    model,
    messages: msgs,
    max_tokens: options.maxTokens || 800,
    temperature: 0.2,
    stream: false
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);

  try {
    const res = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + HF_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    const rawText = await res.text();
    if (!res.ok) throw new Error('HF ' + res.status + ': ' + rawText.slice(0, 200));

    const data = JSON.parse(rawText);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('HF empty response');
    return String(text);
  } finally {
    clearTimeout(t);
  }
}

export function selectModel() { return 'huggingface'; }

export function availableModels() {
  return HF_MODELS.map(m => ({ name: 'huggingface', model: m, role: 'primary' }));
}

export async function callModel(agent, prompt, options = {}) {
  if (!HF_TOKEN) throw new Error('HF_TOKEN missing in env');

  const messages = [{ role: 'user', content: String(prompt || '') }];
  const errors = [];

  for (const model of HF_MODELS) {
    try {
      console.log('[ai] trying ' + model);
      const result = await callHFModel(model, messages, options);
      trackOk(model);
      console.log('[ai] success with ' + model);
      return result;
    } catch (e) {
      trackFail(model, e.message);
      console.error('[ai] ' + model + ' failed: ' + e.message);
      errors.push(model + ': ' + e.message.slice(0, 100));
    }
  }

  throw new Error('All HF models failed → ' + errors.join(' | '));
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) {
    out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr };
  }
  return out;
}
