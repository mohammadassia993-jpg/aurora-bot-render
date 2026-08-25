import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const stream = fs.createWriteStream(path.join(config.root, 'logs', 'platform.log'), { flags: 'a' });

export function log(level, message, meta = {}) {
  const event = JSON.stringify({ time: new Date().toISOString(), level, message, meta });
  console.log(event);
  stream.write(`${event}\n`);
}

export const info = log.bind(null, 'info');
export const warn = log.bind(null, 'warn');
export const error = log.bind(null, 'error');
