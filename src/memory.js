/**
 * memory.js — Collective Memory System (Part 3 of 8)
 *
 * Stores and retrieves: lessons learned, task context, trust scores, audit trail
 * Provides context window: last 3 lessons + last 5 successful tasks + trust record
 */
import { db } from './db.js';
import { audit } from './audit.js';
import { info, warn } from './logger.js';

// ── Lessons Learned ──
export function recordLesson(agent, taskId, lessonType, lessonKey, lessonText, weight = 1.0) {
  const existing = db.prepare(
    'SELECT id, times_applied FROM memory_lessons WHERE agent = ? AND lesson_key = ?'
  ).get(agent, lessonKey);

  if (existing) {
    db.prepare(`
      UPDATE memory_lessons
      SET lesson_text = ?, weight = MAX(weight, ?), times_applied = times_applied + 1,
          last_applied = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(lessonText, weight, existing.id);
    info('memory', `lesson updated: ${agent}/${lessonKey} (applied ${existing.times_applied + 1}x)`);
  } else {
    db.prepare(`
      INSERT INTO memory_lessons(agent, task_id, lesson_type, lesson_key, lesson_text, weight)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(agent, taskId, lessonType, lessonKey, lessonText, weight);
    info('memory', `lesson recorded: ${agent}/${lessonKey}`);
  }
}

export function getLessons(agent, limit = 10) {
  return db.prepare(`
    SELECT * FROM memory_lessons
    WHERE agent = ? OR agent = 'global'
    ORDER BY weight DESC, times_applied DESC, created_at DESC
    LIMIT ?
  `).all(agent, limit);
}

export function getRecentLessons(agent, limit = 3) {
  return db.prepare(`
    SELECT * FROM memory_lessons
    WHERE (agent = ? OR agent = 'global')
    ORDER BY created_at DESC LIMIT ?
  `).all(agent, limit);
}

// ── Task Context ──
export function recordTaskContext(taskId, agent, contextKey, contextValue) {
  db.prepare(`
    INSERT INTO memory_task_context(task_id, agent, context_key, context_value)
    VALUES (?, ?, ?, ?)
  `).run(taskId, agent, contextKey, String(contextValue).slice(0, 5000));
}

export function getTaskContext(taskId) {
  return db.prepare(`
    SELECT agent, context_key, context_value FROM memory_task_context
    WHERE task_id = ? ORDER BY id
  `).all(taskId);
}

export function getRecentSuccessfulTasks(agent, limit = 5) {
  return db.prepare(`
    SELECT t.id, t.title, t.status, t.fit_score, t.assigned_agent,
           t.created_at, t.updated_at
    FROM tasks t
    WHERE t.assigned_agent = ? AND t.status IN ('done', 'ready_for_approval', 'drafted')
    ORDER BY t.updated_at DESC LIMIT ?
  `).all(agent, limit);
}

// ── Trust Log ──
export function recordTrust(agent, taskId, trustScore, reason = '') {
  db.prepare(`
    INSERT INTO memory_trust_log(agent, task_id, trust_score, reason)
    VALUES (?, ?, ?, ?)
  `).run(agent, taskId, trustScore, reason);
}

export function getTrustScore(agent) {
  const row = db.prepare(`
    SELECT AVG(trust_score) as avg_trust, COUNT(*) as entries
    FROM memory_trust_log WHERE agent = ?
  `).get(agent);
  return { avgTrust: row?.avg_trust || 50, entries: row?.entries || 0 };
}

export function getTrustHistory(agent, limit = 10) {
  return db.prepare(`
    SELECT * FROM memory_trust_log WHERE agent = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(agent, limit);
}

// ── Audit Trail ──
export function recordAuditEntry(agent, action, resource, detail, dctVerified = 0) {
  db.prepare(`
    INSERT INTO memory_audit_trail(agent, action, resource, detail, dct_verified)
    VALUES (?, ?, ?, ?, ?)
  `).run(agent, action, resource, String(detail).slice(0, 2000), dctVerified ? 1 : 0);
}

export function getAuditTrail(agent = null, limit = 20) {
  if (agent) {
    return db.prepare(`
      SELECT * FROM memory_audit_trail WHERE agent = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(agent, limit);
  }
  return db.prepare(`
    SELECT * FROM memory_audit_trail ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

// ── Context Window (combined retrieval for any agent) ──
export function getAgentContextWindow(agent) {
  const lessons = getRecentLessons(agent, 3);
  const recentTasks = getRecentSuccessfulTasks(agent, 5);
  const trust = getTrustScore(agent);
  const recentAudit = getAuditTrail(agent, 5);

  return {
    agent,
    lessons: lessons.map(l => ({
      key: l.lesson_key,
      text: l.lesson_text,
      type: l.lesson_type,
      weight: l.weight,
      applied: l.times_applied
    })),
    recentTasks: recentTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      score: t.fit_score,
      date: t.updated_at
    })),
    trust: {
      average: Math.round(trust.avgTrust * 10) / 10,
      samples: trust.entries
    },
    recentAudit: recentAudit.map(a => ({
      action: a.action,
      resource: a.resource,
      dctVerified: !!a.dct_verified,
      date: a.created_at
    })),
    summary: formatContextSummary(agent, lessons, recentTasks, trust)
  };
}

function formatContextSummary(agent, lessons, tasks, trust) {
  const lines = [`📦 سياق الذاكرة — ${agent}`];
  if (lessons.length) {
    lines.push('📚 الدروس الأخيرة:');
    for (const l of lessons) lines.push(`  • [${l.lesson_type}] ${l.lesson_text.slice(0, 100)}`);
  }
  if (tasks.length) {
    lines.push('✅ المهام الناجحة الأخيرة:');
    for (const t of tasks) lines.push(`  • #${t.id}: ${t.title.slice(0, 60)} (${t.fit_score}/100)`);
  }
  lines.push(`🛡️ درجة الثقة: ${Math.round(trust.avgTrust || 50)}/100 (${trust.entries} عينة)`);
  return lines.join('\n');
}

// ── Learn from Error (auto-record) ──
export function learnFromError(agent, taskId, errorType, errorMessage, fixAction = '') {
  const lessonKey = `error:${errorType}`;
  recordLesson(agent, taskId, 'error_resolution', lessonKey, `${errorMessage}${fixAction ? ' → Solution: ' + fixAction : ''}`, 1.2);
  recordAuditEntry(agent, 'error_learned', `task:${taskId}`, `Error: ${errorType} — ${errorMessage.slice(0, 200)}`);
}

// ── Learn from Success (auto-record) ──
export function learnFromSuccess(agent, taskId, taskTitle, score) {
  const lessonKey = `success:${taskTitle.slice(0, 50).replace(/\s+/g, '_')}`;
  recordLesson(agent, taskId, 'success_pattern', lessonKey, `Successfully completed: ${taskTitle} (score: ${score})`, 1.0);
  recordTrust(agent, taskId, score, `task_completed_successfully`);
  recordAuditEntry(agent, 'task_success', `task:${taskId}`, `Score: ${score}/100`);
}

export function formatMemoryReport() {
  const lessonCount = db.prepare('SELECT COUNT(*) as c FROM memory_lessons').get().c;
  const taskContextCount = db.prepare('SELECT COUNT(*) as c FROM memory_task_context').get().c;
  const trustEntries = db.prepare('SELECT COUNT(*) as c FROM memory_trust_log').get().c;
  const auditEntries = db.prepare('SELECT COUNT(*) as c FROM memory_audit_trail').get().c;
  const agents = db.prepare('SELECT DISTINCT agent FROM memory_lessons').all().map(r => r.agent);

  return [
    '🧠 تقرير الذاكرة الجماعية',
    '━━━━━━━━━━━━━━━',
    `📚 الدروس المُسجّلة: ${lessonCount}`,
    `📋 سياقات المهام: ${taskContextCount}`,
    `🛡️ سجلات الثقة: ${trustEntries}`,
    `📝 سجلات التدقيق: ${auditEntries}`,
    '',
    `الوكلاء النشطون: ${agents.join(', ') || 'لا يوجد'}`
  ].join('\n');
}
