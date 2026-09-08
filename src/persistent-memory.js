/**
 * persistent-memory.js — 4-Type Persistent Memory System
 *
 * 1. Working Memory  (الذاكرة العاملية) — current session context
 * 2. Episodic Memory  (الذاكرة الحدثية) — past task records
 * 3. Semantic Memory  (الذاكرة الدلالية) — lessons learned & knowledge
 * 4. Procedural Memory (الذاكرة الإجرائية) — rules & procedures
 */
import { db } from './db.js';
import { info, warn } from './logger.js';

// ── Schema (extends existing db.js tables) ──
db.exec(`
CREATE TABLE IF NOT EXISTS memory_working (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_working_slot_key ON memory_working(slot, key);

CREATE TABLE IF NOT EXISTS memory_episodic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT 'system',
  task_id INTEGER,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  outcome TEXT DEFAULT 'pending',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_semantic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL DEFAULT 'general',
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  times_used INTEGER DEFAULT 0,
  last_used TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_domain_topic ON memory_semantic(domain, topic);

CREATE TABLE IF NOT EXISTS memory_procedural (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_pattern TEXT NOT NULL,
  procedure_name TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  success_rate REAL DEFAULT 1.0,
  times_executed INTEGER DEFAULT 0,
  last_executed TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// ── 1. Working Memory (current session context) ──
export const WorkingMemory = {
  set(slot, key, value) {
    const existing = db.prepare('SELECT id FROM memory_working WHERE slot = ? AND key = ?').get(slot, key);
    if (existing) {
      db.prepare('UPDATE memory_working SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(String(value), existing.id);
    } else {
      db.prepare('INSERT INTO memory_working(slot, key, value) VALUES (?, ?, ?)').run(slot, key, String(value));
    }
  },
  get(slot, key) {
    const row = db.prepare('SELECT value FROM memory_working WHERE slot = ? AND key = ?').get(slot, key);
    return row ? row.value : null;
  },
  getAll(slot) {
    return db.prepare('SELECT key, value, updated_at FROM memory_working WHERE slot = ?').all(slot);
  },
  clear(slot) {
    db.prepare('DELETE FROM memory_working WHERE slot = ?').run(slot);
  },
  clearAll() {
    db.prepare('DELETE FROM memory_working').run();
  }
};

// ── 2. Episodic Memory (task history records) ──
export const EpisodicMemory = {
  record(eventType, agent, taskId, title, summary, outcome = 'success', metadata = {}) {
    db.prepare(`
      INSERT INTO memory_episodic(event_type, agent, task_id, title, summary, outcome, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventType, agent, taskId, title, summary, outcome, JSON.stringify(metadata));
    info('memory', `episodic: ${eventType} — ${title.slice(0, 50)}`);
  },
  recent(limit = 20) {
    return db.prepare('SELECT * FROM memory_episodic ORDER BY created_at DESC LIMIT ?').all(limit);
  },
  byAgent(agent, limit = 10) {
    return db.prepare('SELECT * FROM memory_episodic WHERE agent = ? ORDER BY created_at DESC LIMIT ?').all(agent, limit);
  },
  successes(limit = 10) {
    return db.prepare("SELECT * FROM memory_episodic WHERE outcome = 'success' ORDER BY created_at DESC LIMIT ?").all(limit);
  },
  failures(limit = 10) {
    return db.prepare("SELECT * FROM memory_episodic WHERE outcome = 'failed' ORDER BY created_at DESC LIMIT ?").all(limit);
  },
  getPatterns() {
    return db.prepare(`
      SELECT event_type, outcome, COUNT(*) as count
      FROM memory_episodic
      GROUP BY event_type, outcome
      ORDER BY count DESC
    `).all();
  }
};

// ── 3. Semantic Memory (knowledge & lessons) ──
export const SemanticMemory = {
  store(domain, topic, content, confidence = 0.5) {
    const existing = db.prepare('SELECT id FROM memory_semantic WHERE domain = ? AND topic = ?').get(domain, topic);
    if (existing) {
      db.prepare(`
        UPDATE memory_semantic SET content = ?, confidence = MAX(confidence, ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(content, confidence, existing.id);
    } else {
      db.prepare('INSERT INTO memory_semantic(domain, topic, content, confidence) VALUES (?, ?, ?, ?)').run(domain, topic, content, confidence);
    }
    info('memory', `semantic: ${domain}/${topic}`);
  },
  recall(domain, topic) {
    const row = db.prepare('SELECT * FROM memory_semantic WHERE domain = ? AND topic = ?').get(domain, topic);
    if (row) {
      db.prepare('UPDATE memory_semantic SET times_used = times_used + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    }
    return row;
  },
  search(query, limit = 5) {
    return db.prepare(`
      SELECT * FROM memory_semantic
      WHERE topic LIKE ? OR content LIKE ?
      ORDER BY confidence DESC, times_used DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
  },
  byDomain(domain, limit = 10) {
    return db.prepare('SELECT * FROM memory_semantic WHERE domain = ? ORDER BY confidence DESC LIMIT ?').all(domain, limit);
  }
};

// ── 4. Procedural Memory (rules & procedures) ──
export const ProceduralMemory = {
  register(triggerPattern, procedureName, steps) {
    const existing = db.prepare('SELECT id FROM memory_procedural WHERE procedure_name = ?').get(procedureName);
    if (existing) {
      db.prepare('UPDATE memory_procedural SET steps_json = ?, trigger_pattern = ? WHERE id = ?')
        .run(JSON.stringify(steps), triggerPattern, existing.id);
    } else {
      db.prepare('INSERT INTO memory_procedural(trigger_pattern, procedure_name, steps_json) VALUES (?, ?, ?)')
        .run(triggerPattern, procedureName, JSON.stringify(steps));
    }
    info('memory', `procedure registered: ${procedureName}`);
  },
  match(messageText) {
    const all = db.prepare('SELECT * FROM memory_procedural').all();
    const msgLower = String(messageText).toLowerCase();
    for (const proc of all) {
      try {
        const regex = new RegExp(proc.trigger_pattern, 'i');
        if (regex.test(msgLower) || regex.test(messageText)) {
          db.prepare('UPDATE memory_procedural SET times_executed = times_executed + 1, last_executed = CURRENT_TIMESTAMP WHERE id = ?').run(proc.id);
          return proc;
        }
      } catch { /* skip bad regex */ }
    }
    return null;
  },
  recordOutcome(procedureName, success) {
    const row = db.prepare('SELECT id, success_rate, times_executed FROM memory_procedural WHERE procedure_name = ?').get(procedureName);
    if (row) {
      const newRate = ((row.success_rate * row.times_executed) + (success ? 1 : 0)) / (row.times_executed + 1);
      db.prepare('UPDATE memory_procedural SET success_rate = ?, times_executed = times_executed + 1, last_executed = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newRate, row.id);
    }
  },
  topProcedures(limit = 10) {
    return db.prepare('SELECT * FROM memory_procedural ORDER BY success_rate DESC, times_executed DESC LIMIT ?').all(limit);
  }
};

// ── Unified Memory API ──
export const PersistentMemory = {
  working: WorkingMemory,
  episodic: EpisodicMemory,
  semantic: SemanticMemory,
  procedural: ProceduralMemory,

  /** Get full memory context for AI prompts */
  getContext(agent = 'system') {
    const recentTasks = EpisodicMemory.recent(5);
    const topLessons = SemanticMemory.byDomain('lessons', 3);
    const procedures = ProceduralMemory.topProcedures(3);
    const working = WorkingMemory.getAll('global');

    return {
      recentTasks: recentTasks.map(t => `${t.event_type}: ${t.title} [${t.outcome}]`).join('\n') || 'لا توجد',
      lessons: topLessons.map(l => `${l.topic}: ${l.content.slice(0, 100)}`).join('\n') || 'لا توجد',
      procedures: procedures.map(p => `${p.procedure_name} (نسبة نجاح: ${(p.success_rate * 100).toFixed(0)}%)`).join('\n') || 'لا توجد',
      working: working.map(w => `${w.key}: ${w.value}`).join('\n') || 'لا توجد'
    };
  }
};

export default PersistentMemory;
