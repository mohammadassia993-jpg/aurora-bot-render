import { db } from './db.js';
import { audit } from './audit.js';
import { callModel, selectModel } from './ai.js';
import { runConnectors } from './connectors.js';

export async function activateTeam() {
  await runConnectors();
  const task = db.prepare(`
    SELECT * FROM tasks
    WHERE source = 'opportunity' AND status = 'discovered' AND title NOT LIKE 'Configure %'
    ORDER BY fit_score DESC, id ASC LIMIT 1
  ` ).get();
  let processed = null;
  if (task) {
    await planTask(task.id);
    await executeTask(task.id);
    const review = await reviewTask(task.id);
    processed = { taskId: task.id, title: task.title, ...review };
  }
  const scoutReport = await scoutOpportunities();
  const assignments = db.prepare(`
    SELECT source, assigned_agent, COUNT(*) AS count
    FROM tasks GROUP BY source, assigned_agent ORDER BY source
  ` ).all();
  return { processed, scoutReport, assignments };
}

export async function planTask(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('task_not_found');
  const prompt = `You are the Planner. Break this task into safe execution steps and estimate minutes as JSON: ${JSON.stringify(task)}`;
  const output = await callModel('planner', prompt, taskId);
  db.prepare("UPDATE tasks SET status = 'planned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
  return output;
}

export async function executeTask(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('task_not_found');
  const prompt = `You are the Executor. Produce a first draft for: ${task.title}. Requirements: ${task.payload_json}`;
  const output = await callModel('executor', prompt, taskId);
  db.prepare("UPDATE tasks SET status = 'drafted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
  return output;
}

export async function reviewTask(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('task_not_found');
  const prompt = `You are the Reviewer. Score this task package from 0-100 and list blockers: ${task.title}`;
  const output = await callModel('reviewer', prompt, taskId);
  const score = selectModel() === 'local-deterministic'
    ? 80
    : Number(output.match(/(?:score|grade|درجة)\D*(\d{1,3})/i)?.[1] ?? 75);
  const status = score >= 80 ? 'ready_for_approval' : 'needs_revision';
  db.prepare("UPDATE tasks SET status = ?, fit_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, score, taskId);
  return { output, score, status };
}

export async function scoutOpportunities() {
  const prompt = 'Identify three low-risk Web3 income opportunities suitable for a remote team. Return concise JSON.';
  return callModel('scout', prompt);
}

const TASK_TEMPLATES = {
  dework: [
    ['Arabic Web3 educational article', 250],
    ['Protocol documentation translation (EN→AR)', 180],
    ['GitHub issue triage & summary', 120],
    ['DAO community engagement report', 200],
    ['Smart contract audit review notes', 350]
  ],
  titan: [
    ['Titan node health monitoring report', 0],
    ['DePIN infrastructure status summary', 0],
    ['Titan network reward optimization study', 0]
  ],
  jobs: [
    ['Web3 support role application package', 500],
    ['Crypto community manager proposal', 600],
    ['Blockchain content writer sample set', 400]
  ]
};

export async function runHighThroughput(targetCount = 50) {
  const sources = ['dework', 'titan', 'jobs'];
  const produced = [];
  const now = new Date().toISOString().slice(0, 10);
  let cursor = 0;
  let safety = 0;
  while (produced.length < targetCount && safety < 300) {
    safety += 1;
    const source = sources[cursor % sources.length];
    const templates = TASK_TEMPLATES[source] || [];
    const template = templates[produced.length % templates.length] || templates[0];
    if (!template) break;
    const [title, reward] = template;
    const externalId = `ht-${source}-${now}-${produced.length}`;
    const exists = db.prepare('SELECT id FROM tasks WHERE external_id = ?').get(externalId);
    if (!exists) {
      db.prepare(`
        INSERT INTO tasks(source, external_id, title, reward, currency, fit_score, risk, status, payload_json)
        VALUES (?, ?, ?, ?, 'USD', 75, 'low', 'discovered', ?)
      `).run(source, externalId, `${title} #${produced.length + 1}`, reward,
        JSON.stringify({ simulation: true, batch: now, workflow: ['plan', 'execute', 'review', 'human_approval'], live_submission: false }));
      const taskId = db.prepare('SELECT id FROM tasks WHERE external_id = ?').get(externalId).id;
      try {
        await planTask(taskId);
        await executeTask(taskId);
        await reviewTask(taskId);
        produced.push({ taskId, source, title: `${title} #${produced.length + 1}`, status: 'ready_for_approval' });
      } catch (caught) {
        db.prepare("UPDATE tasks SET status = 'needs_revision', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
        produced.push({ taskId, source, title: `${title} #${produced.length + 1}`, status: 'needs_revision', error: caught.message });
      }
    }
    cursor += 1;
  }
  const summary = {
    batch: now,
    target: targetCount,
    produced: produced.length,
    bySource: db.prepare(`SELECT source, COUNT(*) AS c FROM tasks WHERE payload_json LIKE ? GROUP BY source`)
      .all(`%${now}%`).map(row => ({ source: row.source, count: row.c })),
    simulatedOnly: true,
    humanApprovalRequired: true
  };
  audit('aurora', 'high_throughput_run', { target: targetCount, produced: produced.length });
  return summary;
}

export function requestApproval(taskId, kind = 'submission') {
  return db.prepare('INSERT INTO approvals(task_id, kind, payload_json) VALUES (?, ?, ?)')
    .run(taskId, kind, JSON.stringify({ human_required: true }));
}

export function decideApproval(approvalId, approved) {
  db.prepare('UPDATE approvals SET state = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND state = ?')
    .run(approved ? 'approved' : 'rejected', approvalId, 'pending');
}
