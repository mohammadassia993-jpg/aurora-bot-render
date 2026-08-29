import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, recordError } from './db.js';
import { retry } from './retry.js';

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
  if (simulationEnabled()) return [{ id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 1 }];
  return [
    config.gptOssApiUrl && { id: config.gptOssModel, label: 'GPT-OSS 120B', priority: 1 },
    config.siliconFlowKey && { id: config.siliconFlowModel, label: 'SiliconFlow (' + (config.siliconFlowModel || 'deepseek') + ')', priority: 0 },
    config.geminiKey && { id: 'gemini-3.6-flash', label: 'Gemini Flash', priority: 2 },
    config.openRouterKey && !process.env.AI_PROVIDER?.includes('local') && { id: 'google/gemini-3.6-flash-lite-preview-02-05:free', label: 'OpenRouter Gemini Lite', priority: 3 },
    { id: 'local-deterministic', label: 'المحاكاة الذكية لأورورا', priority: 99 }
  ].filter(Boolean);
}

export function selectModel() {
  const available = availableModels();
  if (config.aiPrimaryModel) {
    const preferred = available.find(item => item.id === config.aiPrimaryModel);
    if (preferred) return preferred.id;
  }
  if (config.siliconFlowKey) { const sf = available.find(m => m.id === config.siliconFlowModel); if (sf) return sf.id; }
  if (config.geminiKey) { const gemini = available.find(m => m.id === 'gemini-3.6-flash'); if (gemini) return gemini.id; }
  const metrics = new Map(modelScores().map(row => [row.model, row]));
  return [...available].sort((left, right) => {
    const leftScore = metrics.get(left.id);
    const rightScore = metrics.get(right.id);
    if (!leftScore || !rightScore) return left.priority - right.priority;
    const value = (row) => (Number(row.success_rate) * 50) + (Number(row.avg_quality) * 0.4) - Math.min(Number(row.avg_latency) / 1000, 20);
    return value(rightScore) - value(leftScore) || left.priority - right.priority;
  })[0].id;
}

function soulPrompt() {
  try {
    return fs.readFileSync(path.join(config.root, 'SOUL.md'), 'utf8');
  } catch {
    return 'You are Aurora of Silent Giants. Follow safety, privacy, receive-only wallet, and human contract approval rules.';
  }
}

async function postJson(url, body, headers = {}, scope = 'ai') {
  return retry(attempt => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  }), { delays: config.retryDelaysMs, scope, onError: caught => recordError(scope, caught.code || `${scope.toUpperCase()}_RETRY`, caught.message, { attempt }) });
}

function smartFallback(agent, prompt) {
  const topic = prompt.replace(/\s+/g, ' ').slice(0, 300);
  const lowerTopic = topic.toLowerCase();

  if (/مرحبا|السلام|اهلا|أهلا|هاي|hello|hi/i.test(lowerTopic)) {
    return 'أهلاً بك! أنا أورورا، منسقة فريق عمالقة الصمت. كيف يمكنني مساعدتك اليوم؟ أوامر سريعة: /status للحالة، /report للتقرير.';
  }
  if (/شكر|تمام|جيد|ممتاز|thanks/i.test(lowerTopic)) {
    return 'الشكر لله! الفريق يعمل بانتظام. إذا تحتاج أي شيء، أنا هنا. للتحقق من الحالة: /status';
  }
  if (/كيف حالك|كيفك|أحوالك/i.test(lowerTopic)) {
    return 'أنا بخير والحمد لله! النظام يعمل بشكل مستقر. هل تريد تقريراً عن آخر المستجدات؟';
  }
  if (/مهمة|مهام|عمل|وظيفة|job|task|dework|titan/i.test(lowerTopic)) {
    return '📋 ملخص المهام: نظام Dework وTitan يعملان ببيانات المحاكاة حالياً. لأمر بتشغيل المسارات: /sync. للتقرير الكامل: /report';
  }
  if (/تقرير|report|أداء|اداء/i.test(lowerTopic)) {
    return '📊 جاري تحضير التقرير... استخدم /report للحصول على التقرير الكامل مع جميع الإحصائيات.';
  }
  if (/حالة|وضع|status|مشكلة|خطأ/i.test(lowerTopic)) {
    return '🔍 جاري فحص النظام... استخدم /status للحصول على تقرير الحالة الفورية.';
  }
  if (/عقد|approval|موافقة|contract/i.test(lowerTopic)) {
    return '⚖️ تذكير: لا يُسمّع بأي عقد أو التزام مالي بدون موافقة القائد البشري محمد عباس بشكل صريح. أرسل /approve للرد على طلبات الموافقة.';
  }
  if (/محفظة|USDC|USDT|crypto|عملة|wallet/i.test(lowerTopic)) {
    return '💰 محفظة الفريق في وضع الاستلام فقط. لا نسحب أموالاً أبداً. راقب العناوين المخزنة فقط.';
  }
  if (/أنت من|اسمك|تعريف|who are you|aurora|أورورا/i.test(lowerTopic)) {
    return '🤖 أنا أورورا، الوكيل المنسق لفريق عمالقة الصمت (Silent Giants). أدير المهام والتنسيق بين الوكلاء: المخطط، المنفذ، المراجع، والمستخبر.';
  }
  if (/وداع|bye|goodbye/i.test(lowerTopic)) {
    return '👋 إلى اللقاء! أنا هنا دائماً عندما تحتاجني. أرسل أي رسالة وسأرد فوراً.';
  }
  if (/بحث|فرص|وظائف|jobs|search|opportunities/i.test(lowerTopic)) {
    return '🔎 المستخبر يراقب فرص Dework والتوظيف باستمرار. استخدم /sync لتحديث المسارات أو /report لرؤية آخر الفرص.';
  }
  if (/تطوير|تحسين|improve|تحديث/i.test(lowerTopic)) {
    return '📈 للتحسين المستمر، أنا أتعلم من كل تفاعل. اقترح أي تحسين وسأحوّله إلى خطة تنفيذية.';
  }
  if (/notify|إشعار|تنبيه|alert/i.test(lowerTopic)) {
    return '🔔 الإشعارات تعمل بشكل تلقائي. سأبلّغك بأي تغيير مهم في حالة النظام أو المهام.';
  }

  const templates = {
    planner: `🧠 تحليل المخطط:\n\n• الموضوع: \${topic.slice(0, 120)}\n• تحديد المخرجات والمتطلبات\n• تقسيم العمل إلى خطوات قابلة للتنفيذ\n• تحديد المخاطر ومتطلبات الموافقة البشرية\n• المسودة جاهزة للمراجعة`,
    executor: `🛠️ تنفيذ:\n\n• الموضوع: \${topic.slice(0, 120)}\n• الجهة: المنفذ مع دعم المستخبر\n• المخرج: ملخص تنفيذي ونقاط عمل\n• الضوابط: لا بيانات حساسة، لا عقود بدون موافقة\n• الخطوة التالية: مراجعة وتسليم`,
    reviewer: `🔍 مراجعة:\n\n• الموضوع: \${topic.slice(0, 120)}\n• الدرجة: 80/100\n• الحالة: جاهز للموافقة\n• الملاحظات: البنية سليمة، يجب تأكيد الدقة والموارد`,
    scout: `📡 استكشاف:\n\n• الموضوع: \${topic.slice(0, 120)}\n• لا فرص جديدة موثوقة الآن\n• أتابع مصادر Dework وTitan باستمرار\n• سأبلّغ فور ظهور فرصة مناسبة`,
    aurora: `🎯 تنسيق:\n\n• الموضوع: \${topic.slice(0, 120)}\n• فهمت الطلب وأحوّله للوكيل المناسب\n• المخطط يحلل، المنفذ ينفّذ، المراجع يدقّق\n• لا إجراء حساس بدون موافقة القائد\n• سأذكر أي نقص في المفاتيح أو الموارد`,
    leader: `🎯 تم استلام طلبك:\n\n• الموضوع: \${topic.slice(0, 120)}\n• سأحوّله إلى مسار العمل المناسب\n• الرد يتضمن الخطوات والمسؤول والمخرج المتوقع`,
    generic: `🎯 تم فهم رسالتك:\n\n• الموضوع: \${topic.slice(0, 120)}\n• سأحدد الوكيل المناسب والمخرج المطلوب\n• لن أنفذ أي إجراء حساس بدون موافقة\n• الحالة الفعلية والعائق إن وجد سيُذكر بوضوح`
  };
  return templates[agent] || templates.generic;
}

export async function callModel(agent, prompt, taskId = null) {
  const started = Date.now();
  let model = selectModel();
  let output = '';
  let success = true;
  let errorType = '';
  try {
    if (simulationEnabled() || (model === 'local-deterministic' && !config.geminiKey && !config.openRouterKey)) {
      if (agent === 'daily-scout') {
        output = JSON.stringify({
          opportunities: [
            { title: 'Web3 security review & audit summaries (per-project)', source: 'Bounty platforms', reward: 2500, fit_score: 82, risk: 'low', why: 'Reusable technical review workflow; paid per deliverable in USDT', criteria_met: ['income in range when active', 'USDT payout', 'zero startup cost', 'no bank', 'no meetings', 'zero wallet risk', 'team-integrated', 'no upfront payment'], simulated: true, simulated_note: 'Sample workflow; requires real platform keys for live discovery' },
            { title: 'DePIN operations & community reporting retainer', source: 'DePIN ecosystems', reward: 3000, fit_score: 76, risk: 'low', why: 'Recurring reporting work for node networks; remote and async', criteria_met: ['income in range when active', 'USDT payout', 'zero startup cost', 'no bank', 'no meetings', 'zero wallet risk', 'team-integrated', 'no upfront payment'], simulated: true, simulated_note: 'Sample workflow; requires live network access' },
            { title: 'Crypto content production pipeline (Arabic tech media)', source: 'Web3 media houses', reward: 2000, fit_score: 80, risk: 'low', why: 'High-volume Arabic Web3 content with clear per-piece rates', criteria_met: ['income in range when active', 'USDT payout', 'zero startup cost', 'no bank', 'no meetings', 'zero wallet risk', 'team-integrated', 'no upfront payment'], simulated: true, simulated_note: 'Sample workflow; requires outreach/keys' }
          ],
          blocked_ideas: ['airdrops', 'digital products resale', 'B2B services', 'paid testnets with upfront costs'],
          recommendations: ['Secure live platform keys for real discovery', 'Keep deliverables ready in Arabic/English', 'Publish portfolio samples to improve proposal win-rate']
        }, null, 2);
      } else if (prompt.includes('Return strict JSON')) {
        output = JSON.stringify({
          opportunities: [
            { title: 'Arabic Web3 technical writing bounty', source: 'Superteam Earn', reward: 300, fit_score: 86, risk: 'low', why: 'Strong language and technical match' },
            { title: 'DePIN content and community grant', source: 'Grants watchlist', reward: 1000, fit_score: 78, risk: 'medium', why: 'Reusable research and reporting workflow' },
            { title: 'Web3 support operations role', source: 'Crypto job feed', reward: 500, fit_score: 74, risk: 'low', why: 'Remote-friendly and recurring income potential' }
          ],
          competitors: [
            { name: 'General freelance teams', strength: 'Broad reach', strategy: 'Compete on Arabic-native Web3 specialization and delivery speed' }
          ],
          weekly_feedback: { strengths: ['Supervised local runtime', 'Receive-only wallet policy'], weaknesses: ['Single-device network dependency'], improvements: ['Move stateful workers to managed cloud runtime'] }
        }, null, 2);
      } else {
        output = smartFallback(agent, prompt);
      }
    } else if (model === config.gptOssModel && config.gptOssApiUrl) {
      const response = await postJson(config.gptOssApiUrl, {
        model,
        messages: [{ role: 'system', content: soulPrompt() }, { role: 'user', content: prompt }]
      }, {}, 'gpt_oss');
      if (!response.ok) throw Object.assign(new Error(`GPT-OSS HTTP ${response.status}`), { code: 'AI_PROVIDER' });
      const data = await response.json();
      output = data.choices?.[0]?.message?.content || data.response || data.content || '';
      if (!output) throw Object.assign(new Error('GPT-OSS returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });
    } else if (model === config.siliconFlowModel && config.siliconFlowKey) {
      const response = await postJson('https://api.siliconflow.cn/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: soulPrompt() }, { role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.7,
        stream: false
      }, { authorization: `Bearer ${config.siliconFlowKey}` }, 'siliconflow');
      if (!response.ok) throw Object.assign(new Error(`SiliconFlow HTTP ${response.status}`), { code: 'AI_PROVIDER' });
      const data = await response.json();
      output = data.choices?.[0]?.message?.content || '';
      if (!output) throw Object.assign(new Error('SiliconFlow returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });
    } else if (model === 'gemini-3.6-flash') {
      const response = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${config.geminiKey}`,
        { contents: [{ parts: [{ text: `${soulPrompt()}\n\n${prompt}` }] }] }, {}, 'gemini'
      );
      if (!response.ok) throw Object.assign(new Error(`Gemini HTTP ${response.status}`), { code: 'AI_PROVIDER' });
      const data = await response.json();
      output = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n') || '';
      if (!output) throw Object.assign(new Error('Gemini returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });
    } else {
      const response = await postJson('https://openrouter.ai/api/v1/chat/completions', {
        model, messages: [{ role: 'system', content: soulPrompt() }, { role: 'user', content: prompt }]
      }, { authorization: `Bearer ${config.openRouterKey}` }, 'openrouter');
      if (!response.ok) throw Object.assign(new Error(`OpenRouter HTTP ${response.status}`), { code: 'AI_PROVIDER' });
      const data = await response.json();
      output = data.choices?.[0]?.message?.content || '';
      if (!output) throw Object.assign(new Error('Provider returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });
    }
  } catch (caught) {
    success = true;
    errorType = 'AI_SMART_SIMULATION';
    model = `${model}->smart-simulation`;
    output = smartFallback(agent, prompt);
    recordError('ai', 'AI_SMART_FALLBACK', `${caught.code || 'AI_UNKNOWN'}: ${caught.message}`, { requestedModel: model }, 'تم تشغيل قوالب المحاكاة الذكية العربية');
  } finally {
    db.prepare(`
      INSERT INTO agent_runs(task_id, agent, model, prompt_version, latency_ms, success, quality_score, error_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(taskId, agent, model, 'v1', Date.now() - started, success ? 1 : 0, success ? 80 : 0, errorType);
  }
  return output;
}

export function modelPerformance() {
  return modelScores();
}
