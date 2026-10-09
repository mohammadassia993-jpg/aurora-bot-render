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
    // ⬇️ جديد: جدول الجلسات (للعنوان والتسمية)
    await tursoExec(`CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    // تحديث updated_at للجلسة (إن وُجدت)
    try {
      await tursoExec(
        'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [String(sessionId)]
      );
    } catch (e) { /* silent */ }
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

export async function listAllMessages(limit = 100, offset = 0, search = '', session = '') {
  if (!enabled) return { messages: [], hasMore: false };
  try {
    const safeLimit = Math.min(Number(limit) || 100, 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const q = String(search || '').trim();
    const s = String(session || '').trim();

    let where = [];
    let args = [];
    if (s) { where.push('session_id = ?'); args.push(s); }
    if (q) { where.push('content LIKE ?'); args.push('%' + q + '%'); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = `SELECT id, session_id, role, content, meta, created_at FROM chat_messages ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`;
    args.push(String(safeLimit), String(safeOffset));

    const data = await tursoExec(sql, args);
    const messages = rowsToObjects(data);
    return { messages, hasMore: messages.length >= safeLimit };
  } catch (e) {
    console.error('[chat-db] listAllMessages failed:', e.message);
    return { messages: [], hasMore: false, error: e.message };
  }
}

// ⬇️ محدّث: يجمع الجلسات مع عناوينها من chat_sessions
export async function listSessions(limit = 50) {
  if (!enabled) return [];
  try {
    const data = await tursoExec(
      `SELECT m.session_id as id,
              COALESCE(s.title, m.session_id) as title,
              COUNT(m.id) as cnt,
              MAX(m.created_at) as last_at,
              s.created_at as created_at
       FROM chat_messages m
       LEFT JOIN chat_sessions s ON s.id = m.session_id
       WHERE substr(m.session_id, 1, 2) != '__'
       GROUP BY m.session_id
       ORDER BY last_at DESC
       LIMIT ?`,
      [String(limit)]
    );
    return rowsToObjects(data);
  } catch (e) {
    console.error('[chat-db] listSessions failed:', e.message);
    return [];
  }
}

// ⬇️ جديد: إنشاء جلسة جديدة
export async function createSession(sessionId, title) {
  if (!enabled) return false;
  try {
    const sid = String(sessionId).slice(0, 100);
    const t = String(title || 'محادثة جديدة').slice(0, 200);
    await tursoExec(
      'INSERT INTO chat_sessions (id, title) VALUES (?, ?)',
      [sid, t]
    );
    return true;
  } catch (e) {
    console.error('[chat-db] createSession failed:', e.message);
    return false;
  }
}

// ⬇️ جديد: إعادة تسمية جلسة
export async function renameSession(sessionId, newTitle) {
  if (!enabled) return false;
  try {
    const sid = String(sessionId).slice(0, 100);
    const t = String(newTitle || '').slice(0, 200);
    if (!t) return false;
    // جرب التحديث أولاً
    const res = await tursoExec(
      'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [t, sid]
    );
    // إذا لم تكن الجلسة موجودة، أنشئها
    try {
      await tursoExec(
        'INSERT OR IGNORE INTO chat_sessions (id, title) VALUES (?, ?)',
        [sid, t]
      );
    } catch (e) { /* silent */ }
    return true;
  } catch (e) {
    console.error('[chat-db] renameSession failed:', e.message);
    return false;
  }
}

// ⬇️ جديد: حذف جلسة (مع كل رسائلها)
export async function deleteSession(sessionId) {
  if (!enabled) return false;
  try {
    const sid = String(sessionId).slice(0, 100);
    await tursoExec('DELETE FROM chat_messages WHERE session_id = ?', [sid]);
    await tursoExec('DELETE FROM chat_sessions WHERE id = ?', [sid]);
    return true;
  } catch (e) {
    console.error('[chat-db] deleteSession failed:', e.message);
    return false;
  }
}

// ⬇️ جديد: توليد معرّف جلسة جديد
export function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return 'chat-' + ts + '-' + rand;
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
