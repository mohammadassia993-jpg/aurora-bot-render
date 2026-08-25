import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, backupDatabase } from './db.js';
import { config } from './config.js';
import { info, error } from './logger.js';

function checksum(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function retainNewest(directory, prefix, keep = 10) {
  fs.mkdirSync(directory, { recursive: true });
  const files = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix) && name.endsWith('.db'))
    .map(name => ({ name, path: path.join(directory, name), mtime: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime);
  for (const item of files.slice(keep)) {
    fs.rmSync(item.path, { force: true });
    fs.rmSync(`${item.path}.manifest.json`, { force: true });
  }
  return files[0]?.path || '';
}

export async function createBackupSnapshot({ mirrorDir = config.backupMirrorDir, keep = 10 } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  backupDatabase();
  const latest = retainNewest(path.join(config.root, 'backups'), 'platform-', keep);
  if (!latest) throw new Error('backup file was not created');
  const manifest = {
    createdAt: new Date().toISOString(),
    database: path.basename(latest),
    sha256: checksum(latest),
    bytes: fs.statSync(latest).size,
    counts: Object.fromEntries(['tasks', 'errors', 'messages', 'mail_queue', 'health_checks'].map(table => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ]))
  };
  fs.writeFileSync(`${latest}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  let mirroredPath = '';
  if (mirrorDir) {
    fs.mkdirSync(mirrorDir, { recursive: true });
    mirroredPath = path.join(mirrorDir, path.basename(latest));
    fs.copyFileSync(latest, mirroredPath);
    fs.writeFileSync(`${mirroredPath}.manifest.json`, `${JSON.stringify({ ...manifest, source: config.backupUrl || 'local' }, null, 2)}\n`);
    retainNewest(mirrorDir, 'platform-', keep);
  }
  let sync = null;
  if (config.platformRole === 'primary' && config.backupUrl && config.databaseSyncToken) {
    try {
      sync = await pushDatabaseBackup(mirroredPath || latest);
    } catch (caught) {
      sync = { synced: false, error: caught.message };
      error('backup', `render database sync failed: ${caught.message}`);
    }
  }
  return { localPath: latest, mirrorPath: mirroredPath, manifest, sync };
}

export async function pushDatabaseBackup(databasePath) {
  const payload = await fs.promises.readFile(databasePath);
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
  const compressed = zlib.gzipSync(payload, { level: 9 });
  const response = await fetch(`${config.backupUrl.replace(/\/$/, '')}/api/sync/database.gz`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(compressed.byteLength),
      'x-database-sync-key': config.databaseSyncToken,
      'x-sha256': sha256,
      'x-filename': path.basename(databasePath)
    },
    body: compressed,
    signal: AbortSignal.timeout(60_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP_${response.status}`);
  info('backup', `render database synced: ${path.basename(databasePath)}`);
  return { synced: true, status: response.status, ...result };
}

export async function runMailQueue() {
  const module = await import('./mail.js');
  return module.runMailQueue();
}
