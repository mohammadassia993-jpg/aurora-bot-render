import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, recordError } from './db.js';
import { retry } from './retry.js';
import { info, warn } from './logger.js';

function modelScores() {
  return db.prepare(`
    SELECT model, AVG(success) AS success_rate, AVG(latency_ms) AS avg_latency,
           AVG(quality_score) AS avg_quality
    FROM agent_runs GROUP BY model ORDER BY avg_quality DESC, success_rate DESC, avg_latency ASC
  `).all();
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
    config.kimiKey && { id: 'kimi-k3', label: 'Kimi K3 (moonshotai/kimi-k3)', priority: 0 },
    config.agnesKey && { id: 'agnes', label: "Agnes AI (agnes-2.0-flash)", priority: 0 },
    config.gensparkKey && { id: "genspark", label: "Genspark (" + (config.gensparkModel || "genspark-v2") + ")", priority: 0 },
    config.deepSeekKey && { id: config.deepSeekModel, label: 'DeepSeek (' + (config.deepSeekModel || 'deepseek-chat') + ')', priority: 0 },
    config.siliconFlowKey && { id: config.siliconFlowModel, label: 'SiliconFlow (' + (config.siliconFlowModel || 'deepseek') + ')', priority: 1 },
    config.gptOssApiUrl && { id: config.gptOssModel, label: 'GPT-OSS 120B', priority: 2 },
    config.geminiKey && { id: 'gemini-3.6-flash', label: 'Gemini Flash', priority: 2 },
    config.openRouterKey && !process.env.AI_PROVIDER?.includes('local') && { id: 'google/gemini-3.6-flash-lite-preview-02-05:free', label: 'OpenRouter Gemini Lite', priority: 3 },
    { id: 'local-llama-cpp', label: 'ذكاء محلي (node-llama-cpp)', priority: -1 },
    { id: 'ollama', label: 'Ollama محلي (' + (config.ollamaModel || 'qwen') + ')', priority: 2 },
    { id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 99 }
  ].filter(Boolean);
}

export function selectModel() {
  const available = availableModels();
  if (config.aiPrimaryModel) {
    const preferred = available.find(item => item.id === config.aiPrimaryModel);
    if (preferred) return preferred.id;
  }
  if (process.env.AI_PREFER_LOCAL === 'true') {
    const localCpp = available.find(m => m.id === 'local-llama-cpp');
    if (localCpp) return localCpp.id;
    const ollamaModel = available.find(m => m.id === 'ollama');
    if (ollamaModel) return ollamaModel.id;
  }
  return available[0]?.id || 'local-deterministic';
}

// Stub function for API calls (replace with actual implementation)
export async function callModel(modelId, prompt) {
  // This is a placeholder. In the real implementation, this would make
  // the actual HTTP request to the selected AI provider.
  info('ai', `Calling model ${modelId} with prompt: ${prompt.substring(0, 50)}...`);
  return `Response from ${modelId} for: ${prompt}`;
}
