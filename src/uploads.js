import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const uploadRoot = path.join(config.root, 'uploads');
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.zip', '.mp4', '.mov', '.webm', '.txt', '.md', '.csv', '.json']);
const maxBytes = 25 * 1024 * 1024;

export async function saveAttachment({ name = 'attachment', type = '', base64 }) {
  if (typeof base64 !== 'string' || !base64) throw Object.assign(new Error('attachment is empty'), { code: 'ATTACHMENT_EMPTY' });
  const cleanName = path.basename(name).replace(/[\\<>:"|?*\x00-\x1f]/g, '_').slice(0, 180) || 'attachment';
  const extension = path.extname(cleanName).toLowerCase();
  if (!allowedExtensions.has(extension)) throw Object.assign(new Error(`unsupported attachment type ${extension || 'unknown'}`), { code: 'ATTACHMENT_TYPE' });
  const raw = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!raw.length || raw.length > maxBytes) throw Object.assign(new Error('attachment must be between 1 and 25 MB'), { code: 'ATTACHMENT_SIZE' });
  await fs.mkdir(uploadRoot, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
  await fs.writeFile(path.join(uploadRoot, storedName), raw);
  return { name: cleanName, type: type || mimeFor(extension), size: raw.length, path: `/uploads/${storedName}` };
}

function mimeFor(extension) {
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp4': 'video/mp4',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.txt': 'text/plain', '.md': 'text/markdown',
    '.csv': 'text/csv', '.json': 'application/json'
  }[extension] || 'application/octet-stream';
}
