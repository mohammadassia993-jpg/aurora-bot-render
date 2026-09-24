import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, recordError } from './db.js';
import { info, warn } from './logger.js';

const providerState = new Map();

const FAILURE_THRESHOLD = 3;
const BLOCK_DURATION_MS = 60000;
const INTER_PROVIDER_DELAY_MS = 500;

function isProviderBlocked(modelId) {
  const state = providerState.get(modelId);
  if (!state) return false;
  if (state.blockedUntil && Date.now() < state.blockedUntil) return true;
  if (state.blockedUntil && Date.now() >= state.blockedUntil) {
    providerState.set(modelId, { failures: 0, blockedUntil: 0 });
    return false;
  }
  return false;
}

function recordFailure(modelId) {
  const state = providerState.get(modelId) || { failures: 0, blockedUntil: 0 };
  state.failures = (state.failures || 0) + 1;
  if (state.failures >= FAILURE_THRESHOLD) {
    state.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    warn('ai', 'circuit breaker: ' + modelId + ' blocked for ' + (BLOCK_DURATION_MS / 1000) + 's');
    state.failures = 0;
  }
  providerState.set(modelId, state);
}

function recordSuccess(modelId) {
  providerState.set(modelId, { failures: 0, blockedUntil: 0 });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
    config.kiloGatewayUrl || config.llm7Key || config.agnesKey || config.deepSeekKey ||
    config.geminiKey || config.siliconFlowKey || config.openRouterKey || config.kimiKey ||
    config.orcaRouterKey
  );
  if (simulationEnabled() && !hasRealKey) {
    return [{ id: 'local-deterministic', label: 'محاكاة', priority: 99 }];
  }

  return [
    config.kiloGatewayUrl && { id: 'kilo', label: 'Kilo Gateway', priority: 0 },
    config.llm7Key && { id: 'llm7', label: 'LLM7', priority: 1 },
    config.agnesKey && { id: 'agnes', label: 'Agnes', priority: 2 },
    config.deepSeekKey && { id: 'deepseek', label: 'DeepSeek', priority: 2 },
    config.geminiKey && { id: 'gemini', label: 'Gemini', priority: 3 },
    config.siliconFlowKey && { id: 'siliconflow', label: 'SiliconFlow', priority: 3 },
    config.openRouterKey && { id: 'openrouter', label: 'OpenRouter', priority: 4 },
    config.kimiKey && { id: 'kimi-k3', label: 'Kimi', priority: 4 },
    config.orcaRouterKey && { id: 'orcarouter', label: 'OrcaRouter', priority: 5 },
    config.danyApiUrl && { id: 'danyapi', label: 'DanyAPI', priority: 6 },
    config.logfareKey && { id: 'logfare', label: 'Logfare', priority: 7 },
    config.gptOssApiUrl && { id: 'gpt-oss', label: 'GPT-OSS', priority: 8 },
    { id: 'local-deterministic', label: 'محاكاة', priority: 99 }
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

async function callOpenAICompatible({ url, apiKey, model, messages, timeoutMs = 60000, noJsonMode = false }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (apiKey && apiKey !== 'not-needed' && apiKey !== 'anonymous') {
      headers['authorization'] = 'Bearer ' + apiKey;
    }
    const endpoint = url.replace(/\/$/, '') + '/chat/completions';

    const body = {
      model,
      messages,
      temperature: 0.6,
      max_tokens: 2500
    };
    if (!noJsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      const error = new Error('HTTP ' + res.status + ': ' + text.slice(0, 200));
      error.status = res.status;
      error.transient = (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504);
      throw error;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('invalid JSON: ' + text.slice(0, 200)); }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.output?.text ??
      data?.content ??
      data?.response ??
      null;

    if (!content) throw new Error('empty response: ' + text.slice(0, 200));
    return typeof content === 'string' ? content : JSON.stringify(content);
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchToProvider(modelId, prompt, options = {}) {
  const messages = [{ role: 'user', content: prompt }];
  const noJsonMode = options.noJsonMode === true;

  if (modelId === 'kilo') return await callOpenAICompatible({ url: config.kiloGatewayUrl, apiKey: config.kiloGatewayKey, model: config.kiloGatewayModel, messages, noJsonMode });
  if (modelId === 'llm7') return await callOpenAICompatible({ url: config.llm7Url, apiKey: config.llm7Key || 'unused', model: config.llm7Model, messages, noJsonMode });
  if (modelId === 'agnes') return await callOpenAICompatible({ url: config.agnesUrl, apiKey: config.agnesKey, model: config.agnesModel, messages, noJsonMode });
  if (modelId === 'deepseek') return await callOpenAICompatible({ url: 'https://api.deepseek.com/v1', apiKey: config.deepSeekKey, model: config.deepSeekModel, messages, noJsonMode });
  if (modelId === 'gemini') return await callOpenAICompatible({ url: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: config.geminiKey, model: 'gemini-2.0-flash', messages, noJsonMode });
  if (modelId === 'siliconflow') return await callOpenAICompatible({ url: 'https://api.siliconflow.cn/v1', apiKey: config.siliconFlowKey, model: config.siliconFlowModel, messages, noJsonMode });
  if (modelId === 'openrouter') return await callOpenAICompatible({ url: 'https://openrouter.ai/api/v1', apiKey: config.openRouterKey, model: 'google/gemini-flash-1.5:free', messages, noJsonMode });
  if (modelId === 'kimi-k3') return await callOpenAICompatible({ url: config.kimiUrl, apiKey: config.kimiKey, model: config.kimiModel, messages, noJsonMode });
  if (modelId === 'orcarouter') return await callOpenAICompatible({ url: config.orcaRouterUrl, apiKey: config.orcaRouterKey, model: config.orcaRouterModel, messages, noJsonMode });
  if (modelId === 'danyapi') return await callOpenAICompatible({ url: config.danyApiUrl, apiKey: 'not-needed', model: config.danyApiModel, messages, noJsonMode });
  if (modelId === 'logfare') return await callOpenAICompatible({ url: config.logfareUrl, apiKey: config.logfareKey, model: config.logfareModel, messages, noJsonMode });
  if (modelId === 'gpt-oss') return await callOpenAICompatible({ url: config.gptOssApiUrl, apiKey: process.env.GPT_OSS_API_KEY || 'not-needed', model: config.gptOssModel, messages, noJsonMode });
  if (modelId === 'local-deterministic') return 'لا يوجد مزود AI متاح حالياً.';
  throw new Error('unknown provider: ' + modelId);
}

export async function callModel(agentName, prompt, options = {}) {
  const models = availableModels();
  if (!models.length) {
    recordRun(agentName, 'no-model', false, 0);
    return 'عذراً، لا يوجد مزود AI مُهيَّأ.';
  }

  let lastError = null;
  let firstAttempt = true;

  for (const candidate of models) {
    if (isProviderBlocked(candidate.id)) {
      info('ai', agentName + ' -> ' + candidate.id + ' skipped (circuit breaker)');
      continue;
    }

    if (!firstAttempt) await sleep(INTER_PROVIDER_DELAY_MS);
    firstAttempt = false;

    const startedAt = Date.now();
    try {
      const response = await dispatchToProvider(candidate.id, prompt, options);
      const latency = Date.now() - startedAt;
      recordRun(agentName, candidate.id, true, latency);
      recordSuccess(candidate.id);
      info('ai', agentName + ' -> ' + candidate.id + ' ok (' + latency + 'ms)' + (options.noJsonMode ? ' [text]' : ''));
      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      recordRun(agentName, candidate.id, false, latency);
      if (!error.transient) {
        recordFailure(candidate.id);
      } else {
        info('ai', agentName + ' -> ' + candidate.id + ' transient (not counted)');
      }
      warn('ai', agentName + ' -> ' + candidate.id + ' failed: ' + error.message);
      lastError = error;
    }
  }

  recordRun(agentName, 'all-failed', false, 0);
  try { recordError('ai', 'ALL_PROVIDERS_FAILED', lastError?.message || 'unknown'); } catch {}
  return 'عذراً، جميع مزودي AI فشلوا. حاول بعد قليل.';
}

export function modelPerformance() {
  return modelScores();
}
