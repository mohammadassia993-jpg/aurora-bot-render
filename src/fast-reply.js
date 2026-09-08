/**
 * fast-reply.js — 5-Minute Customer Response System
 *
 * Monitors all incoming messages and ensures response within 5 minutes.
 * Logs response times for accountability.
 */
import { db } from './db.js';
import { info, warn } from './logger.js';
import { callModel } from './ai.js';
import { sendMessageDetailed } from './telegram.js';
import { config } from './config.js';

// Response tracking table
db.exec(`
CREATE TABLE IF NOT EXISTS response_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'telegram',
  sender_id TEXT,
  sender_name TEXT DEFAULT '',
  message TEXT NOT NULL,
  reply TEXT DEFAULT '',
  response_time_ms INTEGER DEFAULT 0,
  responded INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  replied_at TEXT
);
`);

/** Log incoming message and ensure fast response */
export async function handleIncomingMessage(platform, senderId, senderName, message) {
  const start = Date.now();

  // Log the incoming message
  const result = db.prepare(`
    INSERT INTO response_log(platform, sender_id, sender_name, message)
    VALUES (?, ?, ?, ?)
  `).run(platform, String(senderId), senderName, message);

  const logId = result.lastInsertRowid;

  // Generate natural Arabic response
  let reply = '';
  try {
    const prompt = `أنت أورورا، مساعدة ذكية في فريق عمالقة الصمت. رد على رسالة العميل بأسلوب ودود ومحترف. حاول تحويل الاستفسار إلى عملية شراء.

رسالة العميل: "${message}"

المنتجات المتوفرة:
1. قاموس Web3 — $15
2. دورة DePIN — $25
3. حزمة كتابة Web3 — $35
4. العقد الذكي — $20
5. حزمة وظائف — $30
6. الأمن والاقتصاد الرمزي — $40
7. الحزمة الشاملة (92 مهمة) — $500

الرد بالعربية الطبيعية. لا JSON. لا أكواد.`;

    reply = await Promise.race([
      callModel('fast-reply', prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 15000))
    ]).catch(() => '');
    reply = String(reply).trim();
  } catch (e) {
    reply = 'مرحباً! 👋 أنا أورورا من عمالقة الصمت. كيف يمكنني مساعدتك اليوم؟ هل تريد الاطلاع على منتجاتنا الرقمية؟';
  }

  if (!reply || reply.length < 10) {
    reply = 'مرحباً! 👋 أنا أورورا من عمالقة الصمت. كيف يمكنني مساعدتك اليوم؟';
  }

  const responseTime = Date.now() - start;

  // Update log
  db.prepare(`
    UPDATE response_log SET reply = ?, response_time_ms = ?, responded = 1, replied_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reply, responseTime, logId);

  info('fast-reply', `Replied in ${responseTime}ms to ${senderName} on ${platform}`);

  return { reply, responseTimeMs: responseTime, logId };
}

/** Get response time stats */
export function getResponseStats() {
  const today = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN responded = 1 THEN 1 ELSE 0 END) as responded,
      AVG(CASE WHEN responded = 1 THEN response_time_ms ELSE NULL END) as avg_ms,
      MAX(CASE WHEN responded = 1 THEN response_time_ms ELSE NULL END) as max_ms,
      SUM(CASE WHEN response_time_ms <= 300000 THEN 1 ELSE 0 END) as within_5min
    FROM response_log
    WHERE date(created_at) = date('now')
  `).get();

  return {
    totalMessages: today.total,
    responded: today.responded,
    avgResponseMs: Math.round(today.avg_ms || 0),
    maxResponseMs: today.max_ms || 0,
    within5Min: today.within_5min || 0
  };
}

export default { handleIncomingMessage, getResponseStats };
