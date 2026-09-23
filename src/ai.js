import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, recordError } from './db.js';
import { info, warn } from './logger.js';

function modelScores() {
  try {
    return db.prepare(`
      SELECT model, AVG(success) AS success_rate, AVG(latency_ms) AS avg_latency,
             AVG(quality_score) AS avg_quality
      FROM agent_runs GROUP BY model ORDER BY avg_quality DESC, success_rate DESC, avg_latency ASC
    `).all();
  } catch { return []; }
}

export function simulationEnabled() {
  return process.env.AI_SIMULATION_MODE !== 'false';
}

export function availableModels() {
  const hasRealKey = Boolean(
    config.danyApiUrl || config.keylessAiUrl ||
    config.deepSeekKey || config.siliconFlowKey || config.geminiKey ||
    config.gptOssApiUrl || config.openRouterKey || config.agnesKey ||
    config.gensparkKey || config.llm7Key || config.logfareKey
  );
  if (simulationEnabled() && !hasRealKey) return [{ id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 1 }];
  return [
    config.danyApiUrl && { id: 'danyapi', label: 'DanyAPI', priority: 0 },
    config.keylessAiUrl && { id: 'keylessai', label: 'KeylessAI', priority: 0 },
    config.logfareKey && { id: 'logfare', label: 'Logfare', priority: 0 },
    config.llm7Key && { id: 'llm7', label: 'LLM7', priority: 0 },
    config.agnesKey && { id: 'agnes', label: 'Agnes', priority: 1 },
    config.deepSeekKey && { id: 'deepseek', label: 'DeepSeek', priority: 1 },
    config.siliconFlowKey && { id: 'siliconflow', label: 'SiliconFlow', priority: 2 },
    config.gptOssApiUrl && { id: 'gpt-oss', label: 'GPT-OSS', priority: 2 },
    config.geminiKey && { id: 'gemini', label: 'Gemini', priority: 3 },
    config.openRouterKey && { id: 'openrouter', label: 'OpenRouter', priority: 3 },
    config.kimiKey && { id: 'kimi-k3', label: 'Kimi K3', priority: 4 },
    { id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 99 }
  ].filter(Boolean);
}

export function selectModel() {
  const available = availableModels();
  if (config.aiPrimaryModel) {
    const preferred = available.find(item => item.id === config.aiPrimaryModel);
    if (preferred) return preferred.id;
  }
  return available[0]?.id || 'local-deterministic';
}

function recordRun(agent, model, success, latencyMs, qualityScore = 80) {
  try {
    db.prepare(`
      INSERT INTO agent_runs(agent, model, success, latency_ms, quality_score)
      VALUES (?, ?, ?, ?, ?)
    `).run(agent, model, success ? 1 : 0, Math.round(latencyMs), qualityScore);
  } catch { /* ignore */ }
}

async function callOpenAICompatible({ url, apiKey, model, messages, timeoutMs = 30000, noJsonMode = false }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (apiKey && apiKey !== 'not-needed') headers['authorization'] = `Bearer ${apiKey}`;
    const endpoint = `${url.replace(/\/$/, '')}/chat/completions`;

    const attempt = async (withJsonMode) => {
      const body = {
        model,
        messages,
        temperature: withJsonMode ? 0.1 : 0.3,
        max_tokens: 2500
      };
      if (withJsonMode && !noJsonMode) body.response_format = { type: 'json_object' };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await res.text();
      return { res, text };
    };

    // إذا noJsonMode → لا نجرب JSON أصلاً
    let { res, text } = await attempt(!noJsonMode);

    // fallback تلقائي إذا رفض JSON
    if (!noJsonMode && !res.ok && res.status === 400 && /response_format|json_object|json mode/i.test(text)) {
      warn('ai', `provider rejected JSON mode, retrying without: ${text.slice(0, 120)}`);
      ({ res, text } = await attempt(false));
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`invalid JSON from provider: ${text.slice(0, 200)}`);
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.output?.text ??
      data?.content ??
      data?.response ??
      null;

    if (!content) throw new Error(`empty response: ${text.slice(0, 200)}`);
    return typeof content === 'string' ? content : JSON.stringify(content);
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchToProvider(modelId, prompt, options = {}) {
  const messages = [{ role: 'user', content: prompt }];
  const noJsonMode = options.noJsonMode === true;

  if (modelId === 'danyapi') return await callOpenAICompatible({ url: config.danyApiUrl, apiKey: 'not-needed', model: config.danyApiModel, messages, noJsonMode });
  if (modelId === 'keylessai') return await callOpenAICompatible({ url: config.keylessAiUrl, apiKey: 'not-needed', model: config.keylessAiModel, messages, noJsonMode });
  if (modelId === 'logfare') return await callOpenAICompatible({ url: config.logfareUrl, apiKey: config.logfareKey, model: config.logfareModel, messages, noJsonMode });
  if (modelId === 'llm7') return await callOpenAICompatible({ url: config.llm7Url, apiKey: config.llm7Key || 'unused', model: config.llm7Model, messages, noJsonMode });
  if (modelId === 'agnes') return await callOpenAICompatible({ url: config.agnesUrl, apiKey: config.agnesKey, model: config.agnesModel, messages, noJsonMode });
  if (modelId === 'deepseek') return await callOpenAICompatible({ url: 'https://api.deepseek.com/v1', apiKey: config.deepSeekKey, model: config.deepSeekModel, messages, noJsonMode });
  if (modelId === 'siliconflow') return await callOpenAICompatible({ url: 'https://api.siliconflow.cn/v1', apiKey: config.siliconFlowKey, model: config.siliconFlowModel, messages, noJsonMode });
  if (modelId === 'gpt-oss') return await callOpenAICompatible({ url: config.gptOssApiUrl, apiKey: process.env.GPT_OSS_API_KEY || 'not-needed', model: config.gptOssModel, messages, noJsonMode });
  if (modelId === 'gemini') return await callOpenAICompatible({ url: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: config.geminiKey, model: 'gemini-2.0-flash', messages, noJsonMode });
  if (modelId === 'openrouter') return await callOpenAICompatible({ url: 'https://openrouter.ai/api/v1', apiKey: config.openRouterKey, model: 'google/gemini-3.6-flash-lite-preview-02-05:free', messages, noJsonMode });
  if (modelId === 'kimi-k3') return await callOpenAICompatible({ url: config.kimiUrl, apiKey: config.kimiKey, model: config.kimiModel, messages, noJsonMode });
  if (modelId === 'local-deterministic') return `مرحباً. أنا أورورا في وضع المحاكاة. سؤالُك: «${prompt.slice(0, 200)}». لم يتم الاتصال بمزود AI حقيقي بعد.`;
  throw new Error(`unknown provider: ${modelId}`);
}

export async function callModel(agentName, prompt, options = {}) {
  const models = availableModels();
  if (!models.length) {
    recordRun(agentName, 'no-model', false, 0);
    return 'عذراً، لا يوجد مزود AI مُهيَّأ.';
  }

  let lastError = null;
  for (const candidate of models) {
    const startedAt = Date.now();
    try {
      const response = await dispatchToProvider(candidate.id, prompt, options);
      const latency = Date.now() - startedAt;
      recordRun(agentName, candidate.id, true, latency);
      info('ai', `${agentName} → ${candidate.id} ok (${latency}ms)${options.noJsonMode ? ' [no-json]' : ''}`);
      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      recordRun(agentName, candidate.id, false, latency);
      warn('ai', `${agentName} → ${candidate.id} failed: ${error.message}`);
      lastError = error;
    }
  }

  recordRun(agentName, 'all-failed', false, 0);
  try { recordError('ai', 'ALL_PROVIDERS_FAILED', lastError?.message || 'unknown'); } catch {}
  return `عذراً، جميع مزودي AI فشلوا. آخر خطأ: ${lastError?.message || 'unknown'}`;
}

export function modelPerformance() {
  return modelScores();
}
