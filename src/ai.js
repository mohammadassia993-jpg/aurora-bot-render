// ai.js — Z.ai primary + LLM7 + HF, with deep thinking & web search
import { recordUsage } from './cost-governor.js';
import { classifyTask, selectModelForTask } from './model-router.js';

const ZAI_KEY = process.env.ZAI_API_KEY || '';
const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

const LLM7_KEY = process.env.LLM7_API_KEY || '';
const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const LLM7_MODEL = 'DeepSeek-V4-Flash';

const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS = ['meta-llama/Llama-3.3-70B-Instruct'];

const metrics = new Map();
const trackOk = m => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.ok++; x.lastErr=''; metrics.set(m,x); };
const trackFail = (m,e) => { const x = metrics.get(m) || {ok:0,fail:0,lastErr:''}; x.fail++; x.lastErr=String(e||'').slice(0,200); metrics.set(m,x); };

// ── ZAI: يدعم thinking + reasoning_effort + web_search ──
async function callZAI(messages, options = {}) {
  if (!ZAI_KEY) throw new Error('ZAI_API_KEY missing');
  const model = options.model || 'glm-4.5-flash';

  const body = {
    model,
    messages,
    max_tokens: options.maxTokens || 800,
    temperature: options.temperature !== undefined ? options.temperature : 0.2,
    // تفعيل التفكير العميق (افتراضي: enabled)
    thinking: { type: options.deepThinking === false ? 'disabled' : 'enabled' }
  };

  // جهد التفكير (للنماذج التي تدعمه - GLM-5.2+)
  if (options.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort;
  }

  // البحث على الويب (اختياري - بتكلفة إضافية)
  if (options.webSearch === true) {
    body.tool_web_search = true;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
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
  const primary = options.model || 'glm-4.5-flash';
  const fallbacks = [primary, 'glm-4.5-flash'].filter((v,i,a) => a.indexOf(v) === i);
  let lastErr = null;
  for (const model of fallbacks) {
    try {
      const r = await callZAI(messages, { ...options, model });
      console.log('[ai] ZAI success with ' + model);
      return { text: r, model };
    } catch (e) {
      lastErr = e;
      console.warn('[ai] ZAI ' + model + ' failed: ' + String(e.message).slice(0,150));
    }
  }
  throw lastErr || new Error('ZAI all models failed');
}

// ── LLM7: يدعم thinking + reasoning_effort ──
async function callLLM7(messages, options = {}) {
  if (!LLM7_KEY) throw new Error('LLM7_API_KEY missing');

  const body = {
    model: LLM7_MODEL,
    messages,
    max_tokens: options.maxTokens || 800,
    temperature: 0.2,
    // DeepSeek-V4 يدعم thinking
    thinking: { type: options.deepThinking === false ? 'disabled' : 'enabled' }
  };
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(LLM7_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + LLM7_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

export function selectModel() { return 'zai-router'; }

export function availableModels() {
  return [
    { name: 'zai', model: 'glm-4.5-flash', role: 'primary' },
    { name: 'llm7', model: LLM7_MODEL,     role: 'fallback' },
    ...HF_MODELS.map(m => ({ name: 'huggingface', model: m, role: 'tertiary' }))
  ];
}

export async function callModel(agent, prompt, options = {}) {
  const complexity = options.complexity || classifyTask(prompt, {
    consecutiveFailures: options.failures || 0,
    currentStep: options.step || 1
  });
  const tier = selectModelForTask(complexity);

  console.log('[ai] complexity=' + complexity + ' model=' + tier.model);

  const wantJson = options.noJsonMode === false;
  const messages = wantJson
    ? [{ role: 'system', content: 'Reply with ONE valid JSON object only. No markdown, no text outside braces.' }, { role: 'user', content: String(prompt || '') }]
    : [{ role: 'user', content: String(prompt || '') }];

  // إعدادات متقدمة حسب نوع المهمة
  const deepThinking = options.deepThinking !== false; // مفعّل افتراضياً
  const webSearch = options.webSearch === true;       // معطّل افتراضياً (له تكلفة)
  const reasoningEffort = complexity === 'complex' ? 'max' : (complexity === 'medium' ? 'high' : 'low');

  const callOpts = {
    maxTokens: options.maxTokens || tier.maxTokens,
    temperature: tier.temperature,
    model: tier.model,
    deepThinking,
    webSearch,
    reasoningEffort
  };

  const errors = [];

  try {
    const result = await callZAIWithFallback(messages, callOpts);
    trackOk('zai:' + result.model);
    recordUsage('zai', result.model, true);
    return result.text;
  } catch (e) {
    trackFail('zai:' + tier.model, e.message);
    recordUsage('zai', tier.model, false, e.message);
    errors.push('ZAI:' + String(e.message).slice(0,80));
    console.error('[ai] ZAI failed:', e.message);
  }

  if (LLM7_KEY) {
    try {
      const r = await callLLM7(messages, callOpts);
      trackOk('llm7'); recordUsage('llm7', LLM7_MODEL, true);
      return r;
    } catch (e) {
      trackFail('llm7', e.message); recordUsage('llm7', LLM7_MODEL, false, e.message);
      errors.push('LLM7:' + String(e.message).slice(0,80));
    }
  }

  for (const model of HF_MODELS) {
    try {
      const r = await callHF(model, messages, callOpts);
      trackOk('hf:' + model); recordUsage('huggingface', model, true);
      return r;
    } catch (e) {
      trackFail('hf:' + model, e.message); recordUsage('huggingface', model, false, e.message);
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
