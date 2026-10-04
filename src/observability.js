// observability.js — System-wide metrics
import { db } from './db.js';

export function getTaskStats() {
  try { return db.prepare(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status`).all(); }
  catch (e) { return []; }
}

export function getErrorStats() {
  try { return db.prepare(`
    SELECT scope, COUNT(*) as count, MAX(last_seen) as lastSeen
    FROM errors WHERE resolved = 0
    GROUP BY scope ORDER BY count DESC LIMIT 15
  `).all(); }
  catch (e) { return []; }
}

export function getAgentActivity() {
  try { return db.prepare(`
    SELECT sender, COUNT(*) as count, MAX(created_at) as lastSeen
    FROM messages WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY sender ORDER BY count DESC
  `).all(); }
  catch (e) { return []; }
}

export function getMemoryStats() {
  try {
    return {
      lessons: db.prepare('SELECT COUNT(*) as c FROM memory_lessons').get()?.c || 0,
      trust:   db.prepare('SELECT COUNT(*) as c FROM memory_trust_log').get()?.c || 0,
      audit:   db.prepare('SELECT COUNT(*) as c FROM memory_audit_trail').get()?.c || 0
    };
  } catch (e) { return { lessons: 0, trust: 0, audit: 0 }; }
}

export function getSystemHealth() {
  try {
    const rows = db.prepare(`
      SELECT component, healthy FROM health_checks
      WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
      AND created_at >= datetime('now', '-10 minutes')
    `).all();
    return { healthy: rows.filter(r => r.healthy === 1).length, total: rows.length, components: rows };
  } catch (e) { return { healthy: 0, total: 0, components: [] }; }
}

export function getRecentLessons(limit = 5) {
  try { return db.prepare(`
    SELECT agent, lesson_type, lesson_text, created_at
    FROM memory_lessons ORDER BY id DESC LIMIT ?
  `).all(limit); }
  catch (e) { return []; }
}

export function getRecentErrors(limit = 10) {
  try { return db.prepare(`
    SELECT scope, error_type, message, created_at FROM errors
    WHERE resolved = 0 ORDER BY id DESC LIMIT ?
  `).all(limit); }
  catch (e) { return []; }
}

export function getFullReport() {
  return {
    tasks: getTaskStats(),
    errors: getErrorStats(),
    agents: getAgentActivity(),
    memory: getMemoryStats(),
    health: getSystemHealth(),
    lessons: getRecentLessons(5),
    recentErrors: getRecentErrors(10),
    generatedAt: new Date().toISOString()
  };
}
