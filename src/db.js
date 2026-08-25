import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(path.join(config.root, 'data'), { recursive: true });
fs.mkdirSync(path.join(config.root, 'logs'), { recursive: true });
fs.mkdirSync(path.join(config.root, 'backups'), { recursive: true });

export const db = new DatabaseSync(path.join(config.root, 'data', 'platform.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT UNIQUE,
  title TEXT NOT NULL,
  reward REAL DEFAULT 0,
  currency TEXT DEFAULT '',
  fit_score REAL DEFAULT 0,
  status TEXT DEFAULT 'discovered',
  risk TEXT DEFAULT 'low',
  payload_json TEXT DEFAULT '{}',
  result_path TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  latency_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  quality_score REAL DEFAULT 0,
  error_type TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT DEFAULT '{}',
  resolved INTEGER DEFAULT 0,
  fix_action TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  suppressed_count INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component TEXT NOT NULL,
  healthy INTEGER NOT NULL,
  detail TEXT DEFAULT '',
  action TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  kind TEXT NOT NULL,
  state TEXT DEFAULT 'pending',
  payload_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS wallet_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset TEXT NOT NULL,
  amount REAL NOT NULL,
  address TEXT NOT NULL,
  tx_hash TEXT UNIQUE,
  confirmed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_key TEXT UNIQUE,
  weight REAL DEFAULT 1,
  reason TEXT DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread TEXT DEFAULT 'team',
  sender TEXT NOT NULL,
  recipient TEXT DEFAULT 'all',
  body TEXT NOT NULL,
  attachment_name TEXT DEFAULT '',
  attachment_type TEXT DEFAULT '',
  attachment_size INTEGER DEFAULT 0,
  attachment_path TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mail_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle TEXT UNIQUE,
  summary TEXT NOT NULL,
  opportunities_json TEXT DEFAULT '[]',
  competitors_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  chat_id TEXT DEFAULT '',
  message_id INTEGER DEFAULT 0,
  status TEXT DEFAULT 'received',
  payload_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS telegram_outgoing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id INTEGER,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  telegram_message_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

try {
  db.exec("ALTER TABLE wallet_events ADD COLUMN network TEXT DEFAULT ''");
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec("ALTER TABLE tasks ADD COLUMN assigned_agent TEXT DEFAULT ''");
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec('ALTER TABLE errors ADD COLUMN occurrence_count INTEGER DEFAULT 1');
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec('ALTER TABLE errors ADD COLUMN suppressed_count INTEGER DEFAULT 0');
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec("ALTER TABLE errors ADD COLUMN last_seen TEXT DEFAULT ''");
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec("ALTER TABLE wallet_events ADD COLUMN symbol TEXT DEFAULT ''");
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec('ALTER TABLE telegram_outgoing ADD COLUMN reply_to_message_id INTEGER');
} catch (error) {
  if (!String(error).includes('duplicate column name')) throw error;
}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_source_status ON tasks(source,status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_errors_recent ON errors(scope,error_type,last_seen)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_telegram_outgoing_status ON telegram_outgoing(status,created_at)');
} catch {}


export function recordError(scope, errorType, message, context = {}, fixAction = '') {
  const recent = db.prepare(`
    SELECT id FROM errors
    WHERE scope=? AND error_type=? AND resolved=0 AND last_seen >= datetime('now', '-6 hours')
    ORDER BY id DESC LIMIT 1
  `).get(scope, errorType);
  if (recent) {
    db.prepare(`
      UPDATE errors
      SET occurrence_count=occurrence_count+1, suppressed_count=suppressed_count+1,
          message=?, context_json=?, fix_action=?, last_seen=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(String(message).slice(0, 2000), JSON.stringify(context), fixAction, recent.id);
    return recent.id;
  }
  const result = db.prepare(`
    INSERT INTO errors(scope, error_type, message, context_json, fix_action, last_seen)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(scope, errorType, String(message).slice(0, 2000), JSON.stringify(context), fixAction);
  return Number(result.lastInsertRowid);
}

export function resolveLatestError(scope, fixAction) {
  const row = db.prepare("SELECT id FROM errors WHERE scope = ? AND resolved = 0 ORDER BY id DESC LIMIT 1").get(scope);
  if (!row) return false;
  db.prepare("UPDATE errors SET resolved = 1, fix_action = ? WHERE id = ?").run(fixAction, row.id);
  return true;
}

export function backupDatabase() {
  fs.mkdirSync(path.join(config.root, 'backups'), { recursive: true });
  const target = path.join(config.root, 'backups', `platform-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  const escaped = target.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return target;
}
