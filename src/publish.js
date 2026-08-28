import { db } from './db.js';
import fs from 'node:fs';
import path from 'node:path';
import { info, warn } from './logger.js';

const QUEUE_PATH = path.join(process.cwd(), 'deploy', 'posthive', 'content-queue.json');

export function preparePublishQueue() {
  try {
    if (!fs.existsSync(QUEUE_PATH)) return { error: 'queue_file_not_found' };
    const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
    const queue = JSON.parse(raw);
    let count = 0;
    db.exec("DELETE FROM outbox WHERE subject LIKE 'PUB:%'");
    for (const post of queue.posts) {
      const result = db.prepare(`
        INSERT INTO outbox(channel, recipient, subject, body, status)
        VALUES (?, 'public', ?, ?, 'queued')
      `).run(post.platform, 'PUB:' + post.content.slice(0, 50), post.content);
      if (result.changes) count++;
    }
    if (count) info('publish', `queued ${count} posts for distribution`);
    return { queued: count, total: queue.posts.length };
  } catch (err) {
    warn('publish', `queue prep failed: ${err.message}`);
    return { error: err.message };
  }
}

export function publishStatus() {
  const queue = db.prepare("SELECT channel, status, COUNT(*) c FROM outbox WHERE subject LIKE 'PUB:%' GROUP BY channel, status").all();
  const hasLogin = fs.existsSync(path.join(process.env.HOME, '.posthive', 'config.json')) || !!process.env.POSTHIVE_API_KEY;
  const lines = [
    '📤 حالة النشر الآلي',
    `- PostHive: ${hasLogin ? '✅ مرتبط' : '❌ غير مرتبط (يحتاج: npx posthive-cli login)'}`,
    `- المنشورات المجهزة: ${queue.reduce((s, r) => s + r.c, 0)}`,
    ...queue.map(r => `  • ${r.channel}: ${r.c} (${r.status})`),
    '',
    hasLogin ? '▶️ جاهز للنشر الفعلي' : '⏳ انتظر ربط PostHive (تسجيل الدخول عبر المتصفح) لتفعيل النشر'
  ];
  return lines.join('\n');
}
