import { db } from './db.js';
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

export function requestApproval(taskId, kind = 'submission') {
  return db.prepare('INSERT INTO approvals(task_id, kind, payload_json) VALUES (?, ?, ?)')
    .run(taskId, kind, JSON.stringify({ human_required: true }));
}

export function decideApproval(approvalId, approved) {
  db.prepare('UPDATE approvals SET state = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND state = ?')
    .run(approved ? 'approved' : 'rejected', approvalId, 'pending');
}
