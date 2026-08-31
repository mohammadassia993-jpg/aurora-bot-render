import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../src/db.js';
import { syncDework, syncOpportunities, syncTitan } from '../src/connectors.js';
import { dailyReport } from '../src/telegram.js';
import { retry } from '../src/retry.js';
import { mailQueueStats, sendMail } from '../src/mail.js';

test('opportunity connector seeds safe local opportunities', async () => {
  await syncOpportunities();
  const count = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE source = 'opportunity'").get().count;
  assert.ok(count >= 3);
});

test('daily report contains the five operational sections', () => {
  const report = dailyReport();
  for (const section of ['التقرير اليومي لأورورا', 'مسار الوظائف:', 'المهام/دي ورك:', 'تيتان/دي بين:', 'الجوائز والفرص:']) {
    assert.match(report, new RegExp(section));
  }
});

test('local reviewer assigns the deterministic passing score', async () => {
  const { reviewTask } = await import('../src/agents.js');
  await syncOpportunities();
  const task = db.prepare("SELECT id FROM tasks WHERE source = 'opportunity' ORDER BY id LIMIT 1").get();
  const review = await reviewTask(task.id);
  assert.equal(review.score, 80);
  assert.equal(review.status, 'ready_for_approval');
});

test('Aurora identity and safety policy are loaded', () => {
  const soul = fs.readFileSync(new URL('../SOUL.md', import.meta.url), 'utf8');
  for (const value of ['Aurora', 'Mohammad Abbas', 'auroraalmada4@gmail.com', 'Never withdraw funds']) {
    assert.ok(soul.includes(value));
  }
});

test('retry performs all configured attempts', async () => {
  let attempts = 0;
  await assert.rejects(
    retry(async () => {
      attempts += 1;
      throw new Error('expected');
    }, { delays: [1, 1], scope: 'test' })
  );
  assert.equal(attempts, 3);
});

test('mail is durably queued when SMTP is unavailable', async () => {
  const { config } = await import('../src/config.js');
  const previousMode = config.mailDeliveryMode;
  const previousPassword = config.smtpPass;
  config.mailDeliveryMode = 'queue';
  config.smtpPass = '';
  let result;
  try {
    result = await sendMail({ subject: 'Queue persistence test', text: 'durable queue test' });
  } finally {
    config.mailDeliveryMode = previousMode;
    config.smtpPass = previousPassword;
  }
  assert.equal(result.queued, true);
  const row = db.prepare('SELECT id, status FROM mail_queue WHERE subject=? AND body=? ORDER BY id DESC LIMIT 1').get('Queue persistence test', 'durable queue test');
  assert.ok(row);
  assert.equal(row.status, 'queued');
  db.prepare('DELETE FROM mail_queue WHERE id=?').run(row.id);
});

test('Dework and Titan use safe simulation without credentials', async () => {
  const dework = await syncDework();
  const titan = await syncTitan();
  assert.equal(dework, true);
  assert.equal(titan, true);
  const deworkRow = db.prepare("SELECT payload_json FROM tasks WHERE source='dework' AND external_id LIKE 'simulation-%' LIMIT 1").get();
  const titanRow = db.prepare("SELECT payload_json FROM tasks WHERE source='titan' AND external_id LIKE 'titan-sim-%' LIMIT 1").get();
  assert.ok(deworkRow);
  assert.ok(titanRow);
  assert.equal(JSON.parse(deworkRow.payload_json).simulation, true);
  assert.equal(JSON.parse(deworkRow.payload_json).live_submission, false);
  assert.equal(JSON.parse(titanRow.payload_json).simulation, true);
});

test('telegram replies are contextual and useful', async () => {
  const { contextualReply } = await import('../src/telegram.js');
  process.env.AI_CHAT_LOCAL_ONLY = '1';
  const reply = await contextualReply('مرحبا', { id: '888229115', username: 'Mohammadabbas891' });
  assert.notEqual(reply.trim(), 'تم');
  assert.match(reply, /محمد|أورورا|تسعدني رسالتك|أهلاً|مرحباً/);
  assert.doesNotMatch(reply, /Aurora local draft|Status: deterministic|خطة المحاكاة|مسودة المحاكاة/);
  delete process.env.AI_CHAT_LOCAL_ONLY;
});

test('telegram webhook updates are processed exactly once', async () => {
  const { handleTelegramUpdate } = await import('../src/telegram.js');
  const updateId = 9_900_000_001;
  db.prepare('DELETE FROM telegram_outgoing WHERE update_id=?').run(updateId);
  db.prepare('DELETE FROM telegram_updates WHERE update_id=?').run(updateId);
  const update = {
    update_id: updateId,
    message: { message_id: 99000001, chat: { id: 888229115, type: 'private' }, from: { id: 888229115, username: 'Mohammadabbas891' }, text: 'اختبار تكرار' }
  };
  const first = await handleTelegramUpdate(update);
  const second = await handleTelegramUpdate(update);
  assert.equal(first, true);
  assert.equal(second, false);
  const deliveries = db.prepare('SELECT COUNT(*) AS count FROM telegram_outgoing WHERE update_id=?').get(updateId).count;
  assert.equal(deliveries, 1);
  db.prepare('DELETE FROM telegram_outgoing WHERE update_id=?').run(updateId);
  db.prepare('DELETE FROM telegram_updates WHERE update_id=?').run(updateId);
  db.prepare("DELETE FROM messages WHERE thread='telegram' AND body='اختبار تكرار'").run();
  db.prepare("DELETE FROM notifications WHERE kind='telegram_message' AND body='اختبار تكرار'").run();
});

test('performance plan exposes bottlenecks and agent KPIs', async () => {
  const { performancePlan } = await import('../src/performance.js');
  const plan = performancePlan();
  assert.equal(plan.bottlenecks.length >= 4, true);
  assert.equal(plan.kpis.length >= 5, true);
  assert.ok(plan.metrics.taskCounts);
});

test('backup snapshot is verifiable and mirrored', async () => {
  const { createBackupSnapshot } = await import('../src/backup.js');
  const { config } = await import('../src/config.js');
  const mirror = path.join(os.tmpdir(), `aurora-backup-test-${Date.now()}`);
  const previousBackupUrl = config.backupUrl;
  config.backupUrl = '';
  let result;
  try {
    result = await createBackupSnapshot({ mirrorDir: mirror, keep: 2 });
  } finally {
    config.backupUrl = previousBackupUrl;
  }
  assert.ok(fs.existsSync(result.localPath));
  assert.ok(fs.existsSync(`${result.localPath}.manifest.json`));
  assert.ok(fs.existsSync(result.mirrorPath));
  assert.match(result.manifest.sha256, /^[a-f0-9]{64}$/);
  fs.rmSync(mirror, { recursive: true, force: true });
});

test('openclaw supervisor registers synchronously', async () => {
  const plugin = (await import('../openclaw-plugin/index.js')).default;
  const services = [];
  const result = plugin.register({ logger: { info(){}, warn(){} }, registerService: service => services.push(service) });
  assert.equal(result, undefined);
  assert.equal(services.length, 1);
});
