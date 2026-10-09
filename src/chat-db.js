// chat-db.js — Persistent chat storage via Turso HTTP API
// Env vars: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

let enabled = false;

export function isEnabled() { return enabled; }

export async function tursoExec(sql, args = []) {
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

// ⬇️ تصحيح: استخراج .value من كل خلية
function extractValue(cell) {
  if (cell == null) return null;
  if (typeof cell === 'object' && 'value' in cell) return cell.value;
  return cell;
}

function rowsToObjects(data) {
  try {
    const result = data && data.results && data.results[0] && data.results[0].response && data.results[0].response.result;
    if (!result) return [];
    const cols = (result.cols || []).map(c => c.name);
    const rows = result.rows || [];
    return rows.map(row => {
      const obj = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = extractValue(row[i]);
      return obj;
    });
  } catch (e) { return []; }
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
      'SELECT id, session_id, role, content, meta, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      [String(sessionId), String(limit)]
    );
    return rowsToObjects(data).reverse();
  } catch (e) {
    console.error('[chat-db] getMessages failed:', e.message);
    return [];
  }
}

export async function listAllMessages(limit = 100, offset = 0, search = '') {
  if (!enabled) return { messages: [], total: 0, hasMore: false };
  try {
    const safeLimit = Math.min(Number(limit) || 100, 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const q = String(search || '').trim();
    let sql, args;
    if (q) {
      sql = `SELECT id, session_id, role, content, meta, created_at FROM chat_messages WHERE content LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`;
      args = ['%' + q + '%', String(safeLimit), String(safeOffset)];
    } else {
      sql = `SELECT id, session_id, role, content, meta, created_at FROM chat_messages ORDER BY id DESC LIMIT ? OFFSET ?`;
      args = [String(safeLimit), String(safeOffset)];
    }
    const data = await tursoExec(sql, args);
    const messages = rowsToObjects(data);
    return { messages, hasMore: messages.length >= safeLimit };
  } catch (e) {
    console.error('[chat-db] listAllMessages failed:', e.message);
    return { messages: [], total: 0, hasMore: false, error: e.message };
  }
}

export async function listSessions(limit = 30) {
  if (!enabled) return [];
  try {
    const data = await tursoExec(
      'SELECT session_id, COUNT(*) as cnt, MAX(created_at) as last_at FROM chat_messages GROUP BY session_id ORDER BY last_at DESC LIMIT ?',
      [String(limit)]
    );
    return rowsToObjects(data);
  } catch (e) {
    console.error('[chat-db] listSessions failed:', e.message);
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
