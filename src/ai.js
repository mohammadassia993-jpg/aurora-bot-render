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
    config.keylessAiUrl ||
    config.deepSeekKey || config.siliconFlowKey || config.geminiKey ||
    config.gptOssApiUrl || config.openRouterKey || config.agnesKey ||
    config.gensparkKey || config.llm7Key || config.logfareKey
  );
  if (simulationEnabled() && !hasRealKey) return [{ id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 1 }];
  return [
    config.keylessAiUrl && { id: 'keylessai', label: 'KeylessAI (gpt-4o)', priority: 0 },
    config.logfareKey && { id: 'logfare', label: 'Logfare (' + (config.logfareModel || 'gemma-4-26b') + ')', priority: 0 },
    config.llm7Key && { id: 'llm7', label: 'LLM7 (' + (config.llm7Model || 'codestral-latest') + ')', priority: 0 },
    config.agnesKey && { id: 'agnes', label: "Agnes AI (agnes-2.0-flash)", priority: 1 },
    config.deepSeekKey && { id: 'deepseek', label: 'DeepSeek', priority: 1 },
    config.siliconFlowKey && { id: 'siliconflow', label: 'SiliconFlow', priority: 2 },
    config.gptOssApiUrl && { id: 'gpt-oss', label: 'GPT-OSS 120B', priority: 2 },
    config.geminiKey && { id: 'gemini', label: 'Gemini Flash', priority: 3 },
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
  } catch { /* table may not exist */ }
}

async function callOpenAICompatible({ url, apiKey, model, messages, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    if (apiKey && apiKey !== 'not-needed') headers['authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 800 }),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchToProvider(modelId, prompt) {
  const messages = [{ role: 'user', content: prompt }];

  if (modelId === 'keylessai') {
    return await callOpenAICompatible({
      url: config.keylessAiUrl,
      apiKey: 'not-needed',
      model: config.keylessAiModel || 'gpt-4o',
      messages
    });
  }
  if (modelId === 'logfare') {
    return await callOpenAICompatible({
      url: config.logfareUrl,
      apiKey: config.logfareKey,
      model: config.logfareModel,
      messages
    });
  }
  if (modelId === 'llm7') {
    return await callOpenAICompatible({
      url: config.llm7Url,
      apiKey: config.llm7Key || 'unused',
      model: config.llm7Model,
      messages
    });
  }
  if (modelId === 'agnes') {
    return await callOpenAICompatible({
      url: config.agnesUrl,
      apiKey: config.agnesKey,
      model: config.agnesModel,
      messages
    });
  }
  if (modelId === 'deepseek') {
    return await callOpenAICompatible({
      url: 'https://api.deepseek.com/v1',
      apiKey: config.deepSeekKey,
      model: config.deepSeekModel,
      messages
    });
  }
  if (modelId === 'siliconflow') {
    return await callOpenAICompatible({
      url: 'https://api.siliconflow.cn/v1',
      apiKey: config.siliconFlowKey,
      model: config.siliconFlowModel,
      messages
    });
  }
  if (modelId === 'gpt-oss') {
    return await callOpenAICompatible({
      url: config.gptOssApiUrl,
      apiKey: process.env.GPT_OSS_API_KEY || 'not-needed',
      model: config.gptOssModel,
      messages
    });
  }
  if (modelId === 'gemini') {
    return await callOpenAICompatible({
      url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: config.geminiKey,
      model: 'gemini-2.0-flash',
      messages
    });
  }
  if (modelId === 'openrouter') {
    return await callOpenAICompatible({
      url: 'https://openrouter.ai/api/v1',
      apiKey: config.openRouterKey,
      model: 'google/gemini-3.6-flash-lite-preview-02-05:free',
      messages
    });
  }
  if (modelId === 'kimi-k3') {
    return await callOpenAICompatible({
      url: config.kimiUrl,
      apiKey: config.kimiKey,
      model: config.kimiModel,
      messages
    });
  }
  if (modelId === 'local-deterministic') {
    return `مرحباً. أنا أورورا في وضع المحاكاة. سؤالُك: «${prompt.slice(0, 200)}». لم يتم الاتصال بمزود AI حقيقي بعد.`;
  }
  throw new Error(`unknown provider: ${modelId}`);
}

export async function callModel(agentName, prompt) {
  const models = availableModels();
  if (!models.length) {
    recordRun(agentName, 'no-model', false, 0);
    return 'عذراً، لا يوجد مزود AI مُهيَّأ.';
  }

  let lastError = null;
  for (const candidate of models) {
    const startedAt = Date.now();
    try {
      const response = await dispatchToProvider(candidate.id, prompt);
      const latency = Date.now() - startedAt;
      recordRun(agentName, candidate.id, true, latency);
      info('ai', `${agentName} → ${candidate.id} ok (${latency}ms)`);
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
