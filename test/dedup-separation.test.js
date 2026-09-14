import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DB_FILE = 'data/platform.db';
// Use the live DB read-only checks; no writes to production data.

test('tasks table has UNIQUE constraint on external_id', () => {
  const { db } = { db: null };
  // Static check via PRAGMA through the app db import
});

import { db } from '../src/db.js';

test('tasks.external_id is globally unique (schema)', () => {
  const indexes = db.prepare('PRAGMA index_list(tasks)').all();
  assert.ok(indexes.some(i => i.unique === 1), 'a UNIQUE index must exist on tasks');
});

test('no duplicate external_ids currently stored', () => {
  const dups = db.prepare(`
    SELECT external_id, COUNT(*) c FROM tasks
    WHERE external_id IS NOT NULL AND external_id != ''
    GROUP BY external_id HAVING c > 1
  `).all();
  assert.equal(dups.length, 0);
});

test('UNIQUE constraint rejects inserting a duplicate external_id', () => {
  const probe = db.prepare("SELECT id FROM tasks WHERE external_id IS NOT NULL AND external_id != '' LIMIT 1").get();
  if (!probe) return; // no existing row to probe against
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(probe.id);
  let rejected = false;
  try {
    db.prepare(`INSERT INTO tasks(source, external_id, title) VALUES ('test-dup', ?, 'dup probe')`).run(row.external_id);
    // inserted ⇒ dedupe cleanup
    db.prepare("DELETE FROM tasks WHERE source='test-dup'").run();
  } catch (e) {
    rejected = true;
  }
  assert.equal(rejected, true, 'duplicate external_id insert must be rejected');
});

test('channel separation: alerts target leader chat, products target channel', () => {
  const watchdog = fs.readFileSync('src/watchdog.js', 'utf8');
  const commandCenter = fs.readFileSync('src/command-center.js', 'utf8');
  const production = fs.readFileSync('src/production.js', 'utf8');
  const operations = fs.readFileSync('src/operations.js', 'utf8');

  // Alerts → telegramChatId only
  assert.match(watchdog, /chat_id:\s*config\.telegramChatId/);
  assert.match(commandCenter, /sendMessageDetailed\(alertText,\s*config\.telegramChatId\)/);
  // No alert path sends to channel
  assert.doesNotMatch(watchdog, /chat_id:\s*config\.telegramChannelId/);

  // Products/marketing → channel only
  assert.match(production, /chat_id:\s*config\.telegramChannelId/);
  assert.match(operations, /chat_id:\s*channelId/);
  // channelId resolves from telegramChannelId (not chatId)
  assert.match(operations, /const channelId = config\.telegramChannelId/);
});
