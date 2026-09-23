/**
 * bot-guard.js — حماية البوت من الدخول غير المصرح
 *
 * - تسجيل كل محاولة
 * - تنبيه فوري للقائد
 * - حظر تلقائي بعد 3 محاولات (24 ساعة)
 * - حظر دائم بعد 10 محاولات
 */
import { db } from './db.js';
import { config } from './config.js';
import { info, warn } from './logger.js';
import { audit } from './audit.js';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS bot_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  chat_id TEXT DEFAULT '',
  message_preview TEXT DEFAULT '',
  action TEXT DEFAULT 'blocked',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bot_access_user ON bot_access_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS bot_access_created ON bot_access_log(created_at);
`);

// ─────────────────────────────────────────────
// إعدادات
// ─────────────────────────────────────────────
const TEMP_BLACKLIST_ATTEMPTS = 3;
const PERM_BLACKLIST_ATTEMPTS = 10;
const TEMP_BLACKLIST_HOURS = 24;
const NOTIFY_EVERY_N = 5;

// in-memory
const tempBlacklist = new Map();
const permanentBlacklist = new Set();

// ─────────────────────────────────────────────
// تحميل القائمة عند البدء
// ─────────────────────────────────────────────
function loadBlacklist() {
  try {
    const perm = db.prepare(`
      SELECT user_id, COUNT(*) as attempts FROM bot_access_log
      GROUP BY user_id HAVING attempts >= ?
    `).all(PERM_BLACKLIST_ATTEMPTS);
    for (const row of perm) permanentBlacklist.add(String(row.user_id));

    const temp = db.prepare(`
      SELECT user_id, MAX(created_at) as last FROM bot_access_log
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY user_id HAVING COUNT(*) >= ?
    `).all(TEMP_BLACKLIST_ATTEMPTS);
    for (const row of temp) {
      const until = new Date(row.last).getTime() + TEMP_BLACKLIST_HOURS * 3600_000;
      tempBlacklist.set(String(row.user_id), { until });
    }

    info('bot-guard', `loaded: ${permanentBlacklist.size} permanent, ${tempBlacklist.size} temporary`);
  } catch (e) {
    warn('bot-guard', `loadBlacklist failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// فحص الحظر
// ─────────────────────────────────────────────
export function isBlacklisted(userId) {
  const id = String(userId);
  if (permanentBlacklist.has(id)) return { blocked: true, reason: 'permanent' };
  const entry = tempBlacklist.get(id);
  if (entry) {
    if (Date.now() > entry.until) {
      tempBlacklist.delete(id);
      return { blocked: false };
    }
    return { blocked: true, reason: 'temporary', until: entry.until };
  }
  return { blocked: false };
}

// ─────────────────────────────────────────────
// تسجيل محاولة
// ─────────────────────────────────────────────
export function registerBlockedAttempt({ userId, username, chatId, messagePreview, reason }) {
  const id = String(userId);
  try {
    db.prepare(`
      INSERT INTO bot_access_log(user_id, username, chat_id, message_preview, action)
      VALUES (?, ?, ?, ?, 'blocked')
    `).run(id, String(username || ''), String(chatId || ''), String(messagePreview || '').slice(0, 300));

    audit('bot-guard', 'blocked_attempt', { userId: id, username, chatId });

    const attempts24h = db.prepare(`
      SELECT COUNT(*) as c FROM bot_access_log
      WHERE user_id = ? AND created_at >= datetime('now', '-24 hours')
    `).get(id).c;

    const attemptsAll = db.prepare(`
      SELECT COUNT(*) as c FROM bot_access_log WHERE user_id = ?
    `).get(id).c;

    if (attempts24h >= TEMP_BLACKLIST_ATTEMPTS && !tempBlacklist.has(id)) {
      tempBlacklist.set(id, { until: Date.now() + TEMP_BLACKLIST_HOURS * 3600_000 });
      warn('bot-guard', `TEMPORARY blacklist: ${id} (${attempts24h} attempts)`);
      notifyLeader('temp_blacklist', { userId: id, username, chatId, attempts: attempts24h });
    }

    if (attemptsAll >= PERM_BLACKLIST_ATTEMPTS && !permanentBlacklist.has(id)) {
      permanentBlacklist.add(id);
      warn('bot-guard', `PERMANENT blacklist: ${id} (${attemptsAll} attempts)`);
      notifyLeader('perm_blacklist', { userId: id, username, chatId, attempts: attemptsAll });
    }

    if (attempts24h === 1) {
      notifyLeader('first_attempt', { userId: id, username, chatId, messagePreview, reason });
    } else if (attempts24h % NOTIFY_EVERY_N === 0) {
      notifyLeader('repeat_attempt', { userId: id, username, chatId, attempts: attempts24h });
    }

    return {
      attempts24h,
      attemptsAll,
      tempBlocked: tempBlacklist.has(id),
      permBlocked: permanentBlacklist.has(id)
    };
  } catch (e) {
    warn('bot-guard', `registerBlockedAttempt failed: ${e.message}`);
    return { attempts24h: 0, attemptsAll: 0, tempBlocked: false, permBlocked: false };
  }
}

// ─────────────────────────────────────────────
// تنبيه القائد
// ─────────────────────────────────────────────
async function notifyLeader(type, data) {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const lines = [];
    switch (type) {
      case 'first_attempt':
        lines.push('🚨 <b>محاولة دخول غير مصرح</b>');
        lines.push('');
        lines.push(`👤 الاسم: ${data.username || 'بدون اسم'}`);
        lines.push(`🆔 ID: <code>${data.userId}</code>`);
        lines.push(`💬 Chat: <code>${data.chatId}</code>`);
        lines.push(`📝 السبب: ${data.reason || 'غير في القائمة البيضاء'}`);
        if (data.messagePreview) lines.push(`📄 الرسالة: <i>${String(data.messagePreview).slice(0, 150)}</i>`);
        lines.push('');
        lines.push('ℹ️ تم تجاهله بصمت.');
        break;
      case 'repeat_attempt':
        lines.push('⚠️ <b>محاولات متكررة</b>');
        lines.push(`👤 ID: <code>${data.userId}</code>`);
        lines.push(`📊 عدد المحاولات: ${data.attempts}`);
        break;
      case 'temp_blacklist':
        lines.push('🔒 <b>حظر مؤقت (24 ساعة)</b>');
        lines.push(`👤 ID: <code>${data.userId}</code>`);
        lines.push(`📊 المحاولات: ${data.attempts}`);
        break;
      case 'perm_blacklist':
        lines.push('⛔ <b>حظر دائم</b>');
        lines.push(`👤 ID: <code>${data.userId}</code>`);
        lines.push(`📊 المحاولات: ${data.attempts}`);
        break;
    }
    await sendMessageDetailed(lines.join('\n'));
  } catch (e) {
    warn('bot-guard', `notifyLeader failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// إحصائيات
// ─────────────────────────────────────────────
export function getGuardStats() {
  try {
    const last24 = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_attempts
      FROM bot_access_log WHERE created_at >= datetime('now', '-24 hours')
    `).get();
    const topOffenders = db.prepare(`
      SELECT user_id, username, COUNT(*) as attempts FROM bot_access_log
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY user_id ORDER BY attempts DESC LIMIT 5
    `).all();
    return {
      last24h: { uniqueUsers: last24.unique_users, totalAttempts: last24.total_attempts },
      blacklist: { temporary: tempBlacklist.size, permanent: permanentBlacklist.size },
      topOffenders
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────
// إدارة يدوية
// ─────────────────────────────────────────────
export function unblacklist(userId) {
  const id = String(userId);
  const wasTemp = tempBlacklist.delete(id);
  const wasPerm = permanentBlacklist.delete(id);
  audit('bot-guard', 'manual_unblacklist', { userId: id });
  return { userId: id, removedTemp: wasTemp, removedPerm: wasPerm };
}

export function blacklistPermanent(userId) {
  permanentBlacklist.add(String(userId));
  audit('bot-guard', 'manual_blacklist', { userId });
  return { userId, added: true };
}

// تحميل عند البدء
loadBlacklist();
info('bot-guard', '🛡️ bot-guard loaded');
