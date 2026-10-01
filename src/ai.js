// ai.js — Cloudflare خفيف (نموذج 8B + 800 tokens)
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const metrics = new Map();

function trackOk() {
  const m = metrics.get('cf') || { ok: 0, fail: 0, lastErr: '' };
  m.ok++;
  metrics.set('cf', m);
}

function trackFail(err) {
  const m = metrics.get('cf') || { ok: 0, fail: 0, lastErr: '' };
  m.fail++;
  m.lastErr = String(err || '').slice(0, 200);
  metrics.set('cf', m);
}

async function callCloudflare(messages, options = {}) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('CF credentials missing');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/run/' + CF_MODEL;

  const wantJson = options.noJsonMode === false;
  const msgs = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }].concat(messages)
    : messages;

  const body = {
    messages: msgs,
    max_tokens: options.maxTokens || 800,
    temperature: 0.2
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + CF_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const rawText = await res.text();
    if (!res.ok) throw new Error('CF ' + res.status + ': ' + rawText.slice(0, 150));
    const data = JSON.parse(rawText);
    if (!data.success) throw new Error('CF: ' + JSON.stringify(data.errors || {}).slice(0, 200));
    const text = (data.result && (data.result.response || data.result.output_text)) || '';
    if (!text) throw new Error('CF empty');
    return String(text);
  } finally { clearTimeout(t); }
}

export function selectModel() { return 'cloudflare'; }
export function availableModels() {
  return [{ name: 'cloudflare', model: CF_MODEL, role: 'primary' }];
}

export async function callModel(agent, prompt, options = {}) {
  const messages = [{ role: 'user', content: String(prompt || '') }];
  try {
    const result = await callCloudflare(messages, options);
    trackOk();
    return result;
  } catch (e) {
    trackFail(e.message);
    console.error('[ai] cloudflare failed: ' + e.message);
    throw e;
  }
}

export function modelPerformance() {
  const out = {};
  for (const [name, m] of metrics.entries()) {
    out[name] = { ok: m.ok, fail: m.fail, lastError: m.lastErr };
  }
  return out;
}
