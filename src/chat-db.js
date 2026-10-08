// chat-db.js — Persistent chat storage via Turso HTTP API
// Env vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
// لا يحتاج أي حزمة خارجية — يستخدم fetch المدمج في Node 22

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

let enabled = false;

function isEnabled() { return enabled; }

async function tursoExec(sql, args = []) {
  if (!TURSO_URL || !TURSO_TOKEN) throw new Error('Turso env vars missing');
  const res = await fetch(TURSO_URL + '/v1/execute', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TURSO_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, args })
  });
  const raw = await res.text();
  if (!res.ok) throw new Error('Turso ' + res.status + ': ' + raw.slice(0, 300));
  return JSON.parse(raw);
}

async function initChatTable() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.warn('[chat-db] Turso env vars missing — disabled');
    return false;
  }
  try {
    await tursoExec(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await tursoExec(`CREATE INDEX IF NOT EXISTS idx_session ON chat_messages(session_id, created_at)`);
    enabled = true;
    console.log('[chat-db] Turso initialized — persistent chat enabled');
    return true;
  } catch (e) {
    console.error('[chat-db] init failed:', e.message);
    return false;
  }
}

async function saveMessage(sessionId, role, content, meta = '') {
  if (!enabled) return false;
  try {
    await tursoExec(
      'INSERT INTO chat_messages (session_id, role, content, meta) VALUES (?, ?, ?, ?)',
      [String(sessionId), String(role), String(content), String(meta).slice(0, 500)]
    );
    return true;
  } catch (e) {
    console.error('[chat-db] saveMessage failed:', e.message);
    return false;
  }
}

async function getMessages(sessionId, limit = 50) {
  if (!enabled) return [];
  try {
    const data = await tursoExec(
      'SELECT role, content, meta, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      [String(sessionId), Number(limit)]
    );
    const rows = (data && data.results && data.results[0] && data.results[0].rows) || [];
    return rows.reverse();
  } catch (e) {
    console.error('[chat-db] getMessages failed:', e.message);
    return [];
  }
}

async function listSessions(limit = 30) {
  if (!enabled) return [];
  try {
    const data = await tursoExec(
      'SELECT session_id, COUNT(*) as cnt, MAX(created_at) as last_at FROM chat_messages GROUP BY session_id ORDER BY last_at DESC LIMIT ?',
      [Number(limit)]
    );
    return (data && data.results && data.results[0] && data.results[0].rows) || [];
  } catch (e) {
    console.error('[chat-db] listSessions failed:', e.message);
    return [];
  }
}

export { isEnabled, initChatTable, saveMessage, getMessages, listSessions };
