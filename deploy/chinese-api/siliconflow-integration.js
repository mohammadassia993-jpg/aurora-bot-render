// SiliconFlow API Integration — بوابة نماذج صينية موحدة
// يوفر DeepSeek, Qwen, GLM, Yi وغيرها عبر مفتاح واحد
// لا يحتاج حظر جغرافي — يعمل من سوريا

const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1';

const AVAILABLE_MODELS = {
  'deepseek-chat': { name: 'DeepSeek V3', provider: 'DeepSeek', context: 64000 },
  'deepseek-reasoner': { name: 'DeepSeek R1', provider: 'DeepSeek', context: 64000 },
  'Qwen/Qwen2.5-72B-Instruct': { name: 'Qwen 2.5 72B', provider: 'Alibaba', context: 131072 },
  'Qwen/Qwen2.5-32B-Instruct': { name: 'Qwen 2.5 32B', provider: 'Alibaba', context: 131072 },
  'THUDM/glm-4-9b-chat': { name: 'GLM-4 9B', provider: 'Zhipu', context: 128000 },
  '01-ai/Yi-1.5-34B-Chat': { name: 'Yi 34B', provider: '01.AI', context: 4096 },
  'Qwen/Qwen2.5-Coder-32B-Instruct': { name: 'Qwen Coder 32B', provider: 'Alibaba', context: 131072 },
};

async function callSiliconFlow(messages, model = 'deepseek-chat', apiKey, options = {}) {
  const { maxTokens = 1024, temperature = 0.7 } = options;
  
  const response = await fetch(`${SILICONFLOW_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SiliconFlow API error ${response.status}: ${error}`);
  }

  return response.json();
}

async function testConnection(apiKey) {
  try {
    const result = await callSiliconFlow(
      [{ role: 'user', content: 'Say hello in Arabic, 3 words only' }],
      'deepseek-chat',
      apiKey,
      { maxTokens: 20 }
    );
    return {
      success: true,
      model: 'deepseek-chat',
      response: result.choices?.[0]?.message?.content || 'no response',
      usage: result.usage
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function listAvailableModels(apiKey) {
  try {
    const response = await fetch(`${SILICONFLOW_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data?.map(m => ({
      id: m.id,
      name: m.name,
      provider: m.owned_by
    })) || [];
  } catch (err) {
    return { error: err.message };
  }
}

export { callSiliconFlow, testConnection, listAvailableModels, AVAILABLE_MODELS, SILICONFLOW_BASE };
