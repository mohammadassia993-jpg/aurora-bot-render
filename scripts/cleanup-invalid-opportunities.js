/**
 * cleanup-invalid-opportunities.js — remove invalid opportunities from DB
 * Rule: reward > 0 (handles N/A, 0, null, empty, non-numeric) + URL + desc > 100 chars.
 * Also removes pending opportunity tasks from task_queue.
 */
import { db } from '../src/db.js';
import { hasValidReward } from '../src/opportunity-validation.js';

export function collectInvalidTaskIds() {
  const rows = db.prepare(`
    SELECT id, title, reward, payload_json FROM tasks
    WHERE source IN ('jobs','opportunity') AND status != 'archived'
  `).all();
  const ids = [];
  for (const r of rows) {
    let payload = {};
    try { payload = JSON.parse(r.payload_json || '{}'); } catch { /* keep empty */ }
    const url = String(payload.url || payload.link || '').trim();
    const desc = String(payload.description || payload.why || payload.details || r.title || '').trim();
    if (!hasValidReward(r.reward) || !/^https?:\/\//i.test(url) || desc.length < 100) ids.push(r.id);
  }
  return ids;
}

export function cleanupInvalidOpportunities() {
  const ids = collectInvalidTaskIds();
  if (!ids.length) return { deletedTasks: 0, deletedQueue: 0 };
  const ph = ids.map(() => '?').join(',');
  const deps = ['agent_runs', 'approvals', 'memory_task_context']
    .map(t => db.prepare(`DELETE FROM ${t} WHERE task_id IN (${ph})`).run(...ids).changes);
  const deletedTasks = db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).run(...ids).changes;
  const deletedQueue = db.prepare("DELETE FROM task_queue WHERE type LIKE '%opportunit%'").run().changes;
  return { deletedTasks, deletedQueue, dependents: deps, removedIds: ids };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = cleanupInvalidOpportunities();
  console.log(JSON.stringify(result, null, 2));
}
