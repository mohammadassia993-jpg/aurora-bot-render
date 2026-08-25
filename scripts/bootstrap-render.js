import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const dataDir = new URL('../data/', import.meta.url);
const incoming = new URL('incoming-platform.db', dataDir);
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const syncKey = process.env.DATABASE_SYNC_TOKEN || '';

async function finish(payload) {
  await fs.writeFile(incoming, payload);
  console.log(JSON.stringify({ downloaded: true, bytes: payload.byteLength }));
}

try {
  if (!token || !syncKey) {
    console.log(JSON.stringify({ downloaded: false, reason: 'missing credentials' }));
    process.exit(0);
  }
  const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    signal: AbortSignal.timeout(15000)
  });
  const info = await infoResponse.json();
  const webhookUrl = info?.result?.url || '';
  const parsed = new URL(webhookUrl);
  if (!/(?:\.pinggy\.net|\.run\.pinggy-free\.link)$/.test(parsed.hostname)) {
    console.log(JSON.stringify({ downloaded: false, reason: 'primary tunnel not detected', host: parsed.hostname }));
    process.exit(0);
  }
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`${parsed.origin}/api/sync/database.gz`, {
        headers: { 'x-database-sync-key': syncKey },
        signal: AbortSignal.timeout(180000)
      });
      if (!response.ok) throw new Error(`primary returned HTTP ${response.status}`);
      break;
    } catch (error) {
      response = undefined;
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  if (!response) throw lastError || new Error('primary database fetch failed');
  const compressed = Buffer.from(await response.arrayBuffer());
  const payload = zlib.gunzipSync(compressed);
  const expected = response.headers.get('x-sha256') || '';
  const actual = crypto.createHash('sha256').update(payload).digest('hex');
  if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('invalid SQLite header');
  if (expected && expected !== actual) throw new Error('checksum mismatch');
  await finish(payload);
} catch (error) {
  console.log(JSON.stringify({ downloaded: false, error: error.message }));
}
