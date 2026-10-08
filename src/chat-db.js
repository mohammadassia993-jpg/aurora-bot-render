// chat-db.js — Persistent chat storage via Turso HTTP API
// Env vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

let enabled = false;

export function isEnabled() { return enabled; }

async function tursoExec(sql, args = []) {
  if (!TURSO_URL || !TURSO_TOKEN) throw new Error('Turso env vars missing');
  const res = await fetch(TURSO_URL + '/v2/pipeline', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TURSO_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(a => ({ type: 'text', value: String(a) })) } },
        { type: 'close' }
      ]
    })
  });
  const raw = await res.text();
  if (!res.ok) throw new Error('Turso ' + res.status + ': ' + raw.slice(0, 300));
  return JSON.parse(raw);
}

export async function initChatTable() {
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
    enabled = true;
    console.log('[chat-db] ✅ Turso initialized — persistent chat enabled');
    return true;
  } catch (e) {
    console.error('[chat-db] ❌ init failed:', e.message);
    return false;
  }
}

export async function saveMessage(sessionId, role, content, meta = '') {
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

export async function getMessages(sessionId, limit = 50) {
  if (!enabled) return [];
  try {
    const data = await tursoExec(
      'SELECT role, content, meta, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      [String(sessionId), String(limit)]
    );
    return data;
  } catch (e) {
    console.error('[chat-db] getMessages failed:', e.message);
    return [];
  }
}

// ============ اختبار تلقائي عند التشغيل ============
(async () => {
  const ok = await initChatTable();
  if (ok) {
    console.log('[chat-db] Self-test: attempting to save test message...');
    const saved = await saveMessage('__self_test__', 'system', 'Hello Turso', 'test');
    console.log('[chat-db] Self-test: save ' + (saved ? 'OK ✅' : 'FAILED ❌'));
  }
})();
