import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { saveAttachment } from './uploads.js';
import { notify } from './notifications.js';

export const AGENTS = [
  { id: 'aurora', name: 'أورورا', role: 'Supervisor and orchestration', icon: '/icons/aurora.svg', color: '#a78bfa' },
  { id: 'planner', name: 'المخطط', role: 'Strategy and task breakdown', icon: '/icons/planner.svg', color: '#60a5fa' },
  { id: 'executor', name: 'المنفذ', role: 'Implementation and delivery', icon: '/icons/executor.svg', color: '#34d399' },
  { id: 'reviewer', name: 'المراجع', role: 'Quality and compliance', icon: '/icons/reviewer.svg', color: '#fbbf24' },
  { id: 'scout', name: 'المستخبر', role: 'Research and opportunities', icon: '/icons/scout.svg', color: '#f472b6' }
];

export const teamEvents = new EventEmitter();
teamEvents.setMaxListeners(200);

export function listMessages(limit = 100) {
  return db.prepare(`
    SELECT id, thread, sender, recipient, body, attachment_name AS attachmentName,
           attachment_type AS attachmentType, attachment_size AS attachmentSize,
           attachment_path AS attachmentPath, created_at AS createdAt
    FROM messages ORDER BY id DESC LIMIT ?
  `).all(Math.min(Number(limit) || 100, 300)).reverse();
}

export async function createMessage(input) {
  let attachment = { name: '', type: '', size: 0, path: '' };
  if (input.attachment?.base64) attachment = await saveAttachment(input.attachment);
  const result = db.prepare(`
    INSERT INTO messages(thread,sender,recipient,body,attachment_name,attachment_type,attachment_size,attachment_path)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    input.thread || 'team', input.sender || 'leader', input.recipient || 'all',
    String(input.body || '').slice(0, 20000), attachment.name, attachment.type,
    attachment.size, attachment.path
  );
  const messageId = Number(result.lastInsertRowid);
  const message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  teamEvents.emit('message', { type: 'created', messageId });
  generateAgentReplies(message).catch(() => {});
  return message;
}

async function generateAgentReplies(message) {
  const targets = message.recipient === 'all'
    ? ['aurora', 'planner', 'executor', 'reviewer', 'scout']
    : [message.recipient];
  for (const agent of targets.filter(id => AGENTS.some(item => item.id === id))) {
    try {
      const output = await callModel(agent, `Team message from leader: ${message.body}\nRespond as the ${agent} agent with a concise actionable Arabic reply.`);
      insertAgentMessage(agent, output);
    } catch {
      insertAgentMessage(agent, 'تم استلام الرسالة وحفظها في قائمة العمل؛ سأعود بتحديث بعد معالجة الموارد المتاحة.');
    }
  }
  await notify('team_message', `رسالة فريق جديدة من ${message.sender}`, message.body.slice(0, 500));
}

function insertAgentMessage(agent, body) {
  const result = db.prepare(`
    INSERT INTO messages(thread,sender,recipient,body) VALUES ('team',?,'leader',?)
  `).run(agent, String(body).slice(0, 20000));
  teamEvents.emit('message', { type: 'agent-reply', messageId: Number(result.lastInsertRowid), agent });
}

export async function attachmentFile(relativePath) {
  const requested = path.resolve(config.root, '.' + relativePath);
  const root = path.resolve(config.root, 'uploads');
  if (!requested.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(requested);
  } catch {
    return null;
  }
}
