import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.root, 'logs', 'audit.log');

export function audit(actor, action, detail = {}) {
  const event = JSON.stringify({
    time: new Date().toISOString(),
    actor,
    action,
    ...detail
  });
  fs.appendFileSync(file, `${event}\n`);
}
