import tls from 'node:tls';
import { config } from './config.js';
import { info, warn } from './logger.js';

/**
 * Lightweight IMAP reader for Gmail (port 993).
 * Reads from config.smtpUser / config.smtpPass (the Google App Password).
 * Supports: read unseen messages, extract verification links, create folders.
 *
 * Gmail IMAP requires the App Password (16-char) for LOGIN command.
 */

function imapReadLine(socket, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timer;
    const onData = chunk => {
      buffer += chunk.toString('utf8');
      const idx = buffer.search(/\r?\n/);
      if (idx === -1) return;
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      resolve(buffer.slice(0, idx));
    };
    const onError = err => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      reject(err);
    };
    timer = setTimeout(() => {
      socket.off('data', onData);
      socket.off('error', onError);
      reject(new Error('IMAP_TIMEOUT'));
    }, timeoutMs);
    socket.on('data', onData);
    socket.once('error', onError);
    if (buffer) onData(Buffer.alloc(0));
  });
}

function imapCmd(socket, tag, command, okPattern = /^\* OK|^\d+ OK/) {
  return new Promise(async (resolve, reject) => {
    const lines = [];
    socket.write(`${tag} ${command}\r\n`);
    try {
      while (true) {
        const line = await imapReadLine(socket);
        lines.push(line);
        if (okPattern.test(line) || /^\d+ NO|^\d+ BAD/.test(line)) break;
      }
      resolve(lines);
    } catch (err) { reject(err); }
  });
}

async function connectImap(user, pass) {
  const socket = tls.connect({ host: 'imap.gmail.com', port: 993, servername: 'imap.gmail.com' });
  await new Promise((resolve, reject) => {
    socket.once('ready', resolve);
    socket.once('error', reject);
    socket.setTimeout(30000);
  });
  const greeting = await imapReadLine(socket);
  info('imap', 'connected', { greeting: greeting.slice(0, 100) });
  const authLines = await imapCmd(socket, 'A001', `LOGIN "${user}" "${pass}"`, /^\d+ OK/);
  info('imap', 'authenticated');
  return { socket, tag: 1 };
}

function nextTag(state) {
  state.tag++;
  return `A${String(state.tag).padStart(3, '0')}`;
}

/**
 * Create IMAP folders (labels in Gmail). No-ops if already exist.
 * Gmail labels use: CREATE "Label/Name"
 */
export async function ensureMailFolders(folders = ['Dework', 'Superteam', 'Zaher', 'Clients', 'Verifications']) {
  const user = config.smtpUser;
  const pass = config.smtpPass;
  if (!user || !pass) {
    return { ok: false, error: 'SMTP_USER/SMTP_PASS not configured' };
  }
  let state;
  try {
    state = await connectImap(user, pass);
    const created = [];
    for (const name of folders) {
      try {
        await imapCmd(state.socket, nextTag(state), `CREATE "Label/${name}"`, /^\d+ OK/);
        created.push(name);
      } catch {
        // folder/label likely already exists — fine
      }
    }
    await imapCmd(state.socket, nextTag(state), 'LOGOUT', /^\*|^\d+ OK/);
    state.socket.destroy();
    return { ok: true, created, folders };
  } catch (err) {
    state?.socket?.destroy();
    warn('imap', 'ensureMailFolders failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Read unseen messages from INBOX. Returns headers + first 1000 chars of body.
 * Useful to auto-read verification links from Dework / Superteam / Zaher.
 */
export async function readUnseenMessages(maxMessages = 20) {
  const user = config.smtpUser;
  const pass = config.smtpPass;
  if (!user || !pass) return { ok: false, error: 'SMTP_USER/SMTP_PASS not configured' };

  let state;
  try {
    state = await connectImap(user, pass);
    await imapCmd(state.socket, nextTag(state), 'SELECT INBOX', /^\d+ OK/);

    const searchLines = await imapCmd(state.socket, nextTag(state), 'SEARCH UNSEEN', /^\d+ \* SEARCH|^\d+ OK/);
    const searchLine = searchLines.find(l => /^\d+ \* SEARCH/.test(l));
    const ids = searchLine ? searchLine.replace(/^\d+ \* SEARCH/, '').trim().split(/\s+/).filter(Boolean).slice(0, maxMessages) : [];

    const messages = [];
    for (const id of ids) {
      const fetchLines = await imapCmd(state.socket, nextTag(state), `FETCH ${id} BODY[HEADER.FIELDS (FROM SUBJECT DATE)]`, /^\d+ OK/);
      const headerBlock = fetchLines.filter(l => !/^\d+ FETCH|^\d+ OK/.test(l)).join(' ');
      const fromMatch = headerBlock.match(/From:\s*(.*)/i);
      const subjectMatch = headerBlock.match(/Subject:\s*(.*)/i);
      const dateMatch = headerBlock.match(/Date:\s*(.*)/i);

      const bodyLines = await imapCmd(state.socket, nextTag(state), `FETCH ${id} BODY[TEXT]`, /^\d+ OK/);
      const bodyBlock = bodyLines.filter(l => !/^\d+ FETCH|^\d+ OK/.test(l)).join('\n');

      const urlMatches = bodyBlock.match(/https?:\/\/[^\s<>"']+/g) || [];

      messages.push({
        id,
        from: fromMatch?.[1]?.trim() || '',
        subject: subjectMatch?.[1]?.trim() || '',
        date: dateMatch?.[1]?.trim() || '',
        bodySnippet: bodyBlock.slice(0, 1000),
        links: urlMatches.slice(0, 10)
      });
    }

    await imapCmd(state.socket, nextTag(state), 'LOGOUT', /^\*|^\d+ OK/);
    state.socket.destroy();
    return { ok: true, count: messages.length, messages };
  } catch (err) {
    state?.socket?.destroy();
    warn('imap', 'readUnseenMessages failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Test IMAP connection only — verify credentials without fetching messages.
 */
export async function testImapConnection() {
  const user = config.smtpUser;
  const pass = config.smtpPass;
  if (!user || !pass) return { ok: false, error: 'missing credentials', user };
  let state;
  try {
    state = await connectImap(user, pass);
    const boxInfo = await imapCmd(state.socket, nextTag(state), 'SELECT INBOX', /^\d+ OK/);
    const existsLine = boxInfo.find(l => /^\* \d+ EXISTS/.test(l));
    const msgCount = existsLine ? Number(existsLine.match(/\* (\d+) EXISTS/)[1]) : 0;
    await imapCmd(state.socket, nextTag(state), 'LOGOUT', /^\*|^\d+ OK/);
    state.socket.destroy();
    return { ok: true, inboxCount: msgCount, user };
  } catch (err) {
    state?.socket?.destroy();
    return { ok: false, error: err.message, user };
  }
}
