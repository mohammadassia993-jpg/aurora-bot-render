import net from 'node:net';
import tls from 'node:tls';
import { config } from './config.js';
import { db } from './db.js';
import { audit } from './audit.js';

class SmtpError extends Error {
  constructor(status, response) {
    super(`SMTP_${status}: ${response.replace(/\s+/g, ' ').slice(0, 500)}`);
    this.name = 'SmtpError';
    this.status = Number(status);
    this.response = response;
  }
}

function readResponse(socket, expected, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buffer = socket.smtpBuffer || '';
    let timer;
    const finish = (response, status) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      if (Number(status) !== Number(expected)) {
        reject(new SmtpError(status, response));
        return;
      }
      resolve(response);
    };
    const onData = chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      const finalIndex = lines.findIndex(line => /^\d{3}(?: |$)/.test(line));
      if (finalIndex === -1) {
        socket.smtpBuffer = buffer;
        return;
      }
      const response = lines.slice(0, finalIndex + 1).join('\n');
      socket.smtpBuffer = lines.slice(finalIndex + 1).join('\n');
      finish(response, lines[finalIndex].slice(0, 3));
    };
    const onError = error => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      reject(error);
    };
    const onTimeout = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.destroy(new Error(`SMTP_TIMEOUT_WAITING_FOR_${expected}`));
      reject(new Error(`SMTP_TIMEOUT_WAITING_FOR_${expected}`));
    };
    timer = setTimeout(onTimeout, timeoutMs);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    onData(Buffer.alloc(0));
  });
}

function smtpCommand(socket, value, expected) {
  return new Promise((resolve, reject) => {
    const pending = readResponse(socket, expected);
    socket.write(`${value}\r\n`, error => {
      if (error) reject(error);
    });
    pending.then(resolve).catch(reject);
  });
}

export function enqueueMail({ to, subject, text, status = 'queued', error = '' }) {
  const result = db.prepare(`
    INSERT INTO mail_queue(to_address, subject, body, status, last_error)
    VALUES (?, ?, ?, ?, ?)
  `).run(to, subject, text, status, String(error || '').slice(0, 1000));
  audit('aurora', `email_${status}`, { to, subject });
  return { id: Number(result.lastInsertRowid), queued: true, status, to };
}

export function mailQueue(limit = 100) {
  return db.prepare(`
    SELECT id, to_address AS recipient, subject, status, attempts, last_error AS lastError,
           created_at AS createdAt, updated_at AS updatedAt
    FROM mail_queue ORDER BY id DESC LIMIT ?
  `).all(Math.min(Number(limit) || 100, 500));
}

export function mailQueueStats() {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM mail_queue GROUP BY status').all();
  return {
    mode: config.mailDeliveryMode,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byStatus: Object.fromEntries(rows.map(row => [row.status, row.count]))
  };
}

export async function deliverMail({ to, subject, text }) {
  const port = config.smtpPort;
  let socket = port === 465
    ? tls.connect({ host: config.smtpHost, port, servername: config.smtpHost })
    : net.connect({ host: config.smtpHost, port });

  try {
    socket.setTimeout(30000);
    await readResponse(socket, '220');
    await smtpCommand(socket, `EHLO ${config.smtpUser.split('@')[1]}`, '250');
    if (port !== 465) {
      await smtpCommand(socket, 'STARTTLS', '220');
      socket = tls.connect({ socket, servername: config.smtpHost });
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
      });
      socket.smtpBuffer = '';
      await smtpCommand(socket, `EHLO ${config.smtpUser.split('@')[1]}`, '250');
    }

    await smtpCommand(socket, 'AUTH LOGIN', '334');
    await smtpCommand(socket, Buffer.from(config.smtpUser).toString('base64'), '334');
    await smtpCommand(socket, Buffer.from(config.smtpPass).toString('base64'), '235');
    await smtpCommand(socket, `MAIL FROM:<${config.smtpUser}>`, '250');
    await smtpCommand(socket, `RCPT TO:<${to}>`, '250');
    await smtpCommand(socket, 'DATA', '354');

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const safeBody = String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    const message = [
      `From: Aurora <${config.smtpUser}>`,
      `To: <${to}>`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      safeBody
    ].join('\r\n');
    await new Promise((resolve, reject) => socket.write(`${message}\r\n.\r\n`, error => error ? reject(error) : resolve()));
    const result = await readResponse(socket, '250');
    socket.write('QUIT\r\n');
    socket.end();
    return result;
  } catch (error) {
    socket.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function sendMail({ to = config.officialEmail, subject, text }) {
  if (config.mailDeliveryMode === 'disabled') {
    return { disabled: true, reason: 'Telegram is the only active communication channel', to };
  }
  if (config.mailDeliveryMode !== 'live' || !config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return enqueueMail({ to, subject, text });
  }
  try {
    const response = await deliverMail({ to, subject, text });
    audit('aurora', 'email_sent', { to, subject });
    return { queued: false, response, to };
  } catch (error) {
    return enqueueMail({ to, subject, text, error: error.message });
  }
}

export async function runMailQueue(limit = 25) {
  if (config.mailDeliveryMode === 'disabled') {
    return { mode: config.mailDeliveryMode, skipped: true, reason: 'email delivery is disabled by leader instruction', ...mailQueueStats() };
  }
  if (config.mailDeliveryMode !== 'live') {
    return { mode: config.mailDeliveryMode, skipped: true, reason: 'mail delivery is intentionally queued', ...mailQueueStats() };
  }
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return { mode: config.mailDeliveryMode, skipped: true, reason: 'SMTP credentials incomplete', ...mailQueueStats() };
  }
  const pending = db.prepare("SELECT * FROM mail_queue WHERE status IN ('queued','failed') ORDER BY id LIMIT ?").all(Math.min(Number(limit) || 25, 100));
  let delivered = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      await deliverMail(item);
      db.prepare("UPDATE mail_queue SET status='sent', attempts=attempts+1, last_error='', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.id);
      delivered++;
    } catch (error) {
      db.prepare("UPDATE mail_queue SET status='failed', attempts=attempts+1, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(String(error.message).slice(0, 1000), item.id);
      failed++;
    }
  }
  return { mode: 'live', processed: pending.length, delivered, failed, ...mailQueueStats() };
}
