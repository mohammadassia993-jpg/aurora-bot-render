/**
 * workflow.js — Full 7-stage workflow with leader notification (Part 4 of 8)
 *
 * Stage 1: Leader sends task
 * Stage 2: Coordinator (Aurora) distributes
 * Stage 3: Scout gathers intel
 * Stage 4: Planner creates execution plan
 * Stage 5: Executor implements
 * Stage 6: Reviewer validates quality
 * Stage 7: Notification to leader via bot
 */
import { db } from './db.js';
import { audit } from './audit.js';
import { callModel, selectModel } from './ai.js';
import { getAgentProfile, getAgentPromptPrefix } from './agent-config.js';
import { verifyAgentAction } from './delegation.js';
import { getAgentContextWindow, recordTaskContext, learnFromSuccess, learnFromError } from './memory.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { config } from './config.js';

const WORKFLOW_STAGES = [
  { id: 0, name: 'created', agent: 'leader', label: '📋 الإنشاء' },
  { id: 1, name: 'distributing', agent: 'aurora', label: '🧠 التوزيع' },
  { id: 2, name: 'researching', agent: 'scout', label: '📡 الاستكشاف' },
  { id: 3, name: 'planning', agent: 'planner', label: '📋 التخطيط' },
  { id: 4, name: 'executing', agent: 'executor', label: '⚙️ التنفيذ' },
  { id: 5, name: 'reviewing', agent: 'reviewer', label: '🔍 المراجعة' },
  { id: 6, name: 'completed', agent: 'system', label: '✅ الاكتمال' }
];

function notifyLeader(text) {
  if (!config.telegramToken || !config.telegramChatId) return;
  sendMessageDetailed(text, config.telegramChatId).catch(e =>
    warn('workflow', `leader notification failed: ${e.message}`)
  );
}

function stageUpdate(taskId, stage, output) {
  const stageDef = WORKFLOW_STAGES[stage];
  db.prepare(`
    UPDATE tasks SET status = ?, assigned_agent = ?, updated_at = CURRENT_TIMESTAMP,
    payload_json = json_set(payload_json, '$.stage_' || ?, ?)
    WHERE id = ?
  `).run(stageDef.name, stageDef.agent, String(stage), String(output).slice(0, 5000), taskId);
  audit(stageDef.agent, 'workflow_stage', { taskId, stage, stageName: stageDef.name });
}

function buildPrompt(agent, taskId, task, contextWindow) {
  const profile = getAgentProfile(agent);
  const prefix = getAgentPromptPrefix(agent);
  const contextStr = contextWindow?.summary || '';

  const prompts = {
    aurora: `أنت أورورا، منسقة فريق عمالقة الصمت.
${prefix}

المهمة الواردة من القائد: "${task.title}"
${contextStr ? '\nالسياق من الذاكرة:\n' + contextStr : ''}

وزّع هذه المهمة بالشكل الصحيح:
1. هل تحتاج استكشاف؟ (نعم/لا + السبب)
2. هل تحتاج تخطيط؟ (نعم/لا + السبب)
3. هل تحتاج تنفيذ؟ (نعم/لا + السبب)
4. هل تحتاج مراجعة؟ (نعم/لا + السبب)
5. الترتيب المقترح للتنفيذ`,

    scout: `أنت المستخبر، تبحث عن معلومات مفيدة لتنفيذ هذه المهمة.
${prefix}

المهمة: "${task.title}"
${contextStr ? '\nالدروس السابقة:\n' + contextStr : ''}

اجمع:
1. معلومات عن الموضوع
2. مصادر مفيدة
3. مخاطر محتملة
4. أمثلة ناجحة مشابهة`,

    planner: `أنت المخطط، تضع خطة تنفيذ مفصلة.
${prefix}

المهمة: "${task.title}"
${contextStr ? '\nالذاكرة الجماعية:\n' + contextStr : ''}

أعد خطة تنفيذ تتضمن:
1. خطوات التنفيذ (مرقمة)
2. المدة التقديرية لكل خطوة
3. المخاطر المحتملة
4. معايير النجاح
5. المخرجات المتوقعة`,

    executor: `أنت المنفذ، نفّذ هذه المهمة بالتفصيل.
${prefix}

المهمة: "${task.title}"
${contextStr ? '\nالدروس المستفادة:\n' + contextStr : ''}

نفّذ وسجّل:
1. كل خطوة تم تنفيذها
2. النتائج الفعلية
3. الأخطاء التي واجهتها وكيف حُلّت
4. المخرجات النهائية`,

    reviewer: `أنت المراجع، راجع جودة هذه المهمة المكتملة.
${prefix}

المهمة: "${task.title}"
${contextStr ? '\nمعايير الجودة:\n' + contextStr : ''}

راجع وأعطني:
1. درجة الجودة (0-100)
2. قائمة المشاكل إن وُجدت
3. توصيات التحسين
4. هل المهمة جاهزة للتسليم؟ (نعم/لا)
5. ملاحظات نهائية`
  };

  return prompts[agent] || `Execute: ${task.title}`;
}

export async function runFullWorkflow(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return { error: 'task_not_found' };

  const startTime = Date.now();
  const results = {};
  let currentStage = 1;

  info('workflow', `starting full workflow for task #${taskId}: "${task.title}"`);
  notifyLeader(`🔄 بدء سير العمل للمهمة #${taskId}: "${task.title}"\n━━━━━━━━━━━\nالمرحلة 1/7: التوزيع...`);

  const contextWindow = getAgentContextWindow('aurora');

  try {
    // Stage 1: Distribution (Aurora)
    const distPrompt = buildPrompt('aurora', taskId, task, contextWindow);
    results.aurora = await callModel('aurora', distPrompt, taskId);
    stageUpdate(taskId, 1, results.aurora);
    recordTaskContext(taskId, 'aurora', 'distribution_plan', String(results.aurora).slice(0, 2000));
    notifyLeader(`✅ المرحلة 1: التوزيع مكتمل\n🧠 أوروراوزّعت المهمة`);

    // Stage 2: Research (Scout)
    const scoutPrompt = buildPrompt('scout', taskId, task, getAgentContextWindow('scout'));
    results.scout = await callModel('scout', scoutPrompt, taskId);
    stageUpdate(taskId, 2, results.scout);
    recordTaskContext(taskId, 'scout', 'research_data', String(results.scout).slice(0, 2000));
    notifyLeader(`✅ المرحلة 2: الاستكشاف مكتمل\n📡 المستخبرجمع البيانات`);

    // Stage 3: Planning (Planner)
    const plannerPrompt = buildPrompt('planner', taskId, task, getAgentContextWindow('planner'));
    results.planner = await callModel('planner', plannerPrompt, taskId);
    stageUpdate(taskId, 3, results.planner);
    recordTaskContext(taskId, 'planner', 'execution_plan', String(results.planner).slice(0, 2000));
    notifyLeader(`✅ المرحلة 3: التخطيط مكتمل\n📋 المخططوضع الخطة`);

    // Stage 4: Execution (Executor)
    const execPrompt = buildPrompt('executor', taskId, task, getAgentContextWindow('executor'));
    results.executor = await callModel('executor', execPrompt, taskId);
    stageUpdate(taskId, 4, results.executor);
    recordTaskContext(taskId, 'executor', 'execution_result', String(results.executor).slice(0, 2000));
    notifyLeader(`✅ المرحلة 4: التنفيذ مكتمل\n⚙️ المنفذنفّذ المهمة`);

    // Stage 5: Review (Reviewer)
    const reviewPrompt = buildPrompt('reviewer', taskId, task, getAgentContextWindow('reviewer'));
    results.reviewer = await callModel('reviewer', reviewPrompt, taskId);
    stageUpdate(taskId, 5, results.reviewer);
    recordTaskContext(taskId, 'reviewer', 'review_result', String(results.reviewer).slice(0, 2000));

    // Extract score
    const scoreMatch = String(results.reviewer).match(/(\d{1,3})\s*\/?\s*100|(?:score|grade|درجة)\D*(\d{1,3})/i);
    const score = Number(scoreMatch?.[1] || scoreMatch?.[2] || 75);

    if (score >= 80) {
      db.prepare("UPDATE tasks SET status = 'done', fit_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(score, taskId);
      stageUpdate(taskId, 6, 'completed');
      learnFromSuccess('aurora', taskId, task.title, score);
      notifyLeader([
        `✅ المهمة #${taskId} مكتملة بنجاح!`,
        `━━━━━━━━━━━`,
        `📝 ${task.title}`,
        `⭐ درجة الجودة: ${score}/100`,
        ``,
        `📋 ملخص التنفيذ:`,
        `• أورورا: ${String(results.aurora).slice(0, 100)}...`,
        `• المستخبر: ${String(results.scout).slice(0, 100)}...`,
        `• المخطط: ${String(results.planner).slice(0, 100)}...`,
        `• المنفذ: ${String(results.executor).slice(0, 100)}...`,
        `• المراجع: ${String(results.reviewer).slice(0, 100)}...`,
        ``,
        `⏱️ المدة الإجمالية: ${Math.round((Date.now() - startTime) / 1000)}ث`
      ].join('\n'));
    } else {
      db.prepare("UPDATE tasks SET status = 'needs_revision', fit_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(score, taskId);
      learnFromError('aurora', taskId, 'low_score', `Score: ${score}/100`, 'needs human review');
      notifyLeader([
        `⚠️ المهمة #${taskId} تحتاج مراجعة`,
        `━━━━━━━━━━━`,
        `📝 ${task.title}`,
        `⭐ درجة الجودة: ${score}/100 (الحد الأدنى: 80)`,
        ``,
        `🔍 ملاحظات المراجع:`,
        String(results.reviewer).slice(0, 500),
        ``,
        `⏰ ${new Date().toISOString()}`
      ].join('\n'));
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    info('workflow', `workflow completed for task #${taskId} in ${duration}s, score: ${score}`);
    return { taskId, results, score, duration, status: score >= 80 ? 'completed' : 'needs_revision' };

  } catch (caught) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    warn('workflow', `workflow failed at stage ${currentStage} for task #${taskId}: ${caught.message}`);
    learnFromError('aurora', taskId, 'workflow_failure', caught.message, `failed at stage ${currentStage}`);
    notifyLeader([
      `❌ فشل سير العمل للمهمة #${taskId}`,
      `━━━━━━━━━━━`,
      `📝 ${task.title}`,
      `🚫 الخطأ: ${caught.message}`,
      `📍 المرحلة: ${currentStage}/7`,
      `⏱️ المدة: ${duration}ث`
    ].join('\n'));
    return { taskId, error: caught.message, failedStage: currentStage, duration };
  }
}

export function getWorkflowStatus() {
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `).all();
  const recent = db.prepare(`
    SELECT id, title, status, assigned_agent, fit_score, updated_at
    FROM tasks ORDER BY updated_at DESC LIMIT 5
  `).all();
  return { stats, recent };
}

export { WORKFLOW_STAGES };
