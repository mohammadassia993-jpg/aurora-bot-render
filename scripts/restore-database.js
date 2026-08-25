import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
const incoming = path.join(dataDir, 'incoming-platform.db');
const target = path.join(dataDir, 'platform.db');

try {
  const payload = await fs.readFile(incoming);
  if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
    throw new Error('invalid SQLite database header');
  }
  await fs.rm(path.join(dataDir, 'platform.db-shm'), { force: true });
  await fs.rm(path.join(dataDir, 'platform.db-wal'), { force: true });
  await fs.rm(target, { force: true });
  await fs.rename(incoming, target);
  console.log(JSON.stringify({ restored: true, bytes: payload.byteLength }));
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(JSON.stringify({ restored: false, reason: 'no incoming database' }));
  } else {
    throw error;
  }
}
