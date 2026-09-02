import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { activateTeam, planTask, executeTask, reviewTask, requestApproval, runHighThroughput } from './agents.js';
import { runConnectors } from './connectors.js';
import { runWeeklyResearch, runDailyResearch } from './research.js';
import { runWatchdog } from './watchdog.js';
import { dailyReport, handleTelegramUpdate, processTelegramOutbox, sendMessageDetailed, telegramMode } from './telegram.js';
import { modelPerformance } from './ai.js';
import { mailQueueStats, sendMail } from './mail.js';
import { readPublicLink } from './tunnel.js';
import { audit } from './audit.js';
import { backupDatabase, recordError } from './db.js';
import { dashboardData } from './dashboard.js';
import { performancePlan } from './performance.js';
import { AGENTS, listMessages, createMessage, attachmentFile, teamEvents } from './team.js';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json'
};

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 35 * 1024 * 1024) throw Object.assign(new Error('request too large'), { code: 'REQUEST_TOO_LARGE' });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(request, limit = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('database backup too large'), { code: 'BACKUP_TOO_LARGE' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload, null, 2));
}

function isLoopback(request) {
  if (request.headers['x-forwarded-for'] || request.headers['cf-connecting-ip'] || request.headers['x-real-ip']) return false;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
}

function authorized(request, url) {
  const supplied = url.searchParams.get('key') || request.headers['x-team-key'] || '';
  const expected = Buffer.from(config.teamUiToken);
  const actual = Buffer.from(String(supplied));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function databaseSyncAuthorized(request) {
  const expected = Buffer.from(config.databaseSyncToken || '');
  const actual = Buffer.from(String(request.headers['x-database-sync-key'] || ''));
  return expected.length > 0 && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function serveFile(response, absolutePath, downloadName = '', cacheControl = 'private, max-age=300') {
  const content = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  response.writeHead(200, {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'content-length': content.length,
    'cache-control': cacheControl,
    ...(downloadName ? { 'content-disposition': `attachment; filename="${encodeURIComponent(downloadName)}"` } : {})
  });
  response.end(content);
}

export async function startServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (url.pathname === '/health') {
        const latest = db.prepare(`
          SELECT component, healthy FROM health_checks
          WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component)
          AND created_at >= datetime('now', '-120 seconds')
        `).all();
        const health = Object.fromEntries(latest.map(row => [row.component, Boolean(row.healthy)]));
        const complete = ['gateway', 'internet', 'telegram', 'ai', 'memory', 'disk'].every(name => name in health);
        if (complete) {
          const ok = Object.values(health).every(Boolean);
          return json(response, ok ? 200 : 503, { ok, health, source: 'cached' });
        }
        const checked = await runWatchdog();
        const ok = Object.values(checked).every(Boolean);
        return json(response, ok ? 200 : 503, { ok, health: checked, source: 'live' });
      }

      if (url.pathname === '/keepalive') {
        return json(response, 200, { ok: true, at: new Date().toISOString() });
      }

      if (url.pathname === '/status') {
        return json(response, 200, {
          telegram: { mode: telegramMode(), tokenValidated: Boolean(config.telegramToken), webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL) },
          backup: { url: config.backupUrl },
          tasksByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all(),
          openErrors: db.prepare("SELECT scope, error_type, message FROM errors WHERE resolved = 0 ORDER BY id DESC LIMIT 20").all(),
          pendingApprovals: db.prepare("SELECT * FROM approvals WHERE state = 'pending'").all(),
          models: modelPerformance()
        });
      }

      if (url.pathname === '/telegram/webhook') {
        if (request.method === 'GET') { return json(response, 200, { ok: true }); }
        if (request.method !== 'POST') { return; }
        // Return 200 immediately, process update in background
        const update = await readBody(request);
        setTimeout(() => {
          handleTelegramUpdate(update).then(() => processTelegramOutbox()).catch(e => recordError('telegram', 'WEBHOOK_BG_ERROR', e.message));
        }, 0);
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/api/sync/database' && request.method === 'GET') {
        if (config.platformRole !== 'primary' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) {
          return json(response, 403, { ok: false, error: 'database export disabled or unauthorized' });
        }
        const backupPath = backupDatabase();
        const payload = await fs.readFile(backupPath);
        await fs.rm(backupPath, { force: true });
        const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(payload.byteLength),
          'x-sha256': sha256,
          'x-filename': path.basename(backupPath),
          'cache-control': 'no-store'
        });
        response.end(payload);
        audit('aurora', 'database_backup_exported', { bytes: payload.byteLength, sha256 });
        return;
      }

      if (url.pathname === '/api/sync/database.gz' && request.method === 'GET') {
        if (config.platformRole !== 'primary' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) {
          return json(response, 403, { ok: false, error: 'database export disabled or unauthorized' });
        }
        const backupPath = backupDatabase();
        const payload = await fs.readFile(backupPath);
        await fs.rm(backupPath, { force: true });
        const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
        const compressed = zlib.gzipSync(payload, { level: 9 });
        response.writeHead(200, {
          'content-type': 'application/gzip',
          'content-length': String(compressed.byteLength),
          'x-sha256': sha256,
          'x-filename': `${path.basename(backupPath)}.gz`,
          'cache-control': 'no-store'
        });
        response.end(compressed);
        audit('aurora', 'compressed_database_backup_exported', {
          bytes: payload.byteLength,
          compressedBytes: compressed.byteLength,
          sha256
        });
        return;
      }

      if (url.pathname === '/api/sync/database.gz' && request.method === 'POST') {
        if (config.platformRole !== 'render' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) {
          return json(response, 403, { ok: false, error: 'database sync disabled or unauthorized' });
        }
        const compressed = await readRawBody(request, 40 * 1024 * 1024);
        let payload;
        try {
          payload = zlib.gunzipSync(compressed);
        } catch {
          return json(response, 400, { ok: false, error: 'invalid gzip database backup' });
        }
        const expectedHash = String(request.headers['x-sha256'] || '');
        const actualHash = crypto.createHash('sha256').update(payload).digest('hex');
        if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) return json(response, 400, { ok: false, error: 'invalid SQLite database' });
        if (expectedHash && expectedHash !== actualHash) return json(response, 400, { ok: false, error: 'backup checksum mismatch' });
        await fs.mkdir(path.join(config.root, 'data'), { recursive: true });
        await fs.writeFile(path.join(config.root, 'data', 'incoming-platform.db'), payload);
        audit('aurora', 'compressed_database_backup_received', { bytes: payload.byteLength, sha256: actualHash });
        if (process.env.ALLOW_DATABASE_RESTORE_RESTART === 'true') setTimeout(() => process.exit(0), 1000).unref();
        return json(response, 202, { ok: true, accepted: true, compressed: true, sha256: actualHash, restoreOnRestart: true });
      }

      if (url.pathname === '/api/sync/database' && request.method === 'POST') {
        if (config.platformRole !== 'render' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) {
          return json(response, 403, { ok: false, error: 'database sync disabled or unauthorized' });
        }
        const payload = await readRawBody(request);
        const expectedHash = String(request.headers['x-sha256'] || '');
        const actualHash = crypto.createHash('sha256').update(payload).digest('hex');
        if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
          return json(response, 400, { ok: false, error: 'invalid SQLite database' });
        }
        if (expectedHash && expectedHash !== actualHash) {
          return json(response, 400, { ok: false, error: 'backup checksum mismatch' });
        }
        await fs.mkdir(path.join(config.root, 'data'), { recursive: true });
        const target = path.join(config.root, 'data', 'incoming-platform.db');
        await fs.writeFile(target, payload);
        audit('aurora', 'database_backup_received', { bytes: payload.byteLength, sha256: actualHash });
        if (process.env.ALLOW_DATABASE_RESTORE_RESTART === 'true') {
          setTimeout(() => process.exit(0), 1000).unref();
        }
        return json(response, 202, { ok: true, accepted: true, sha256: actualHash, restoreOnRestart: true });
      }

      if (url.pathname === '/api/team/telegram' && request.method === 'POST') {
        if (!config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'telegram relay unauthorized' });
        const input = await readBody(request);
        const sender = String(input.sender || 'telegram').slice(0, 80);
        const text = String(input.text || '').slice(0, 20000);
        const messageId = Number(input.messageId || 0);
        if (!text || !messageId) return json(response, 400, { ok: false, error: 'text and messageId are required' });
        const exists = db.prepare("SELECT id FROM messages WHERE thread='telegram-relay' AND sender=? AND body=? LIMIT 1").get(sender, text);
        if (exists) return json(response, 200, { ok: true, duplicated: true });
        const result = db.prepare("INSERT INTO messages(thread,sender,recipient,body) VALUES ('telegram-relay',?,'team',?)").run(sender, text);
        db.prepare('INSERT INTO notifications(kind,title,body) VALUES (?,?,?)').run('telegram_message', 'رسالة Telegram موجهة إلى الواجهة', text.slice(0, 800));
        teamEvents.emit('message', { type: 'telegram', messageId: Number(result.lastInsertRowid) });
        teamEvents.emit('notification', { type: 'telegram_message' });
        return json(response, 201, { ok: true, id: Number(result.lastInsertRowid) });
      }

      const publicShell = ['/', '/dashboard', '/app'].includes(url.pathname);
      const localReport = url.pathname === '/report' && isLoopback(request);
      const publicReadOnlyPath =
        (url.pathname === '/content' || config.publicReadOnly) &&
        request.method === 'GET' &&
        (publicShell ||
          url.pathname === '/content' ||
          url.pathname.startsWith('/icons/') ||
          url.pathname.startsWith('/uploads/') ||
          ['/api/dashboard', '/api/team/agents', '/api/team/tasks', '/api/team/messages', '/api/notifications', '/api/live'].includes(url.pathname));
      if (!publicShell && !localReport && !publicReadOnlyPath && !authorized(request, url)) return json(response, 401, { error: 'team key required' });

      if (url.pathname === '/tasks') {
        return json(response, 200, { tasks: db.prepare('SELECT * FROM tasks ORDER BY fit_score DESC, id DESC LIMIT 100').all() });
      }

      if (url.pathname === '/api/live' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        let closed = false;
        const send = (event, data) => { if (!closed && !response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
        send('messages', { messages: listMessages(120) });
        send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        const onLiveEvent = () => {
          send('messages', { messages: listMessages(120) });
          send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        };
        teamEvents.on('message', onLiveEvent);
        teamEvents.on('notification', onLiveEvent);
        const systemTimer = setInterval(async () => {
          try {
            const dashboard = await dashboardData();
            send('system', { agents: dashboard.agents, system: dashboard.system, finance: dashboard.finance, tasks: db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all() });
            send('tasks', { tasks: db.prepare('SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent, fit_score AS fitScore, updated_at AS updatedAt FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 100').all() });
          } catch {}
        }, 15000);
        const heartbeat = setInterval(() => { if (!closed && !response.destroyed) response.write(': keep-alive\n\n'); }, 25000);
        request.once('close', () => {
          closed = true;
          teamEvents.off('message', onLiveEvent); teamEvents.off('notification', onLiveEvent);
          clearInterval(systemTimer); clearInterval(heartbeat); response.end();
        });
        return;
      }

      if (url.pathname === '/report') {
        const health = await runWatchdog();
        const dashboard = await dashboardData();
        const tunnel = await readPublicLink();
        let finalReport = '';
        try {
          finalReport = await fs.readFile(path.join(config.root, 'data', 'final-report.txt'), 'utf8');
        } catch {}
        return json(response, 200, {
          generatedAt: new Date().toISOString(),
          status: Object.values(health).every(Boolean) ? 'running' : 'degraded',
          health,
          services: {
            platform: true,
            gateway: health.gateway,
            ai: health.ai,
            database: health.memory && health.disk,
            internet: health.internet,
            telegram: Boolean(config.telegramToken),
            telegramMode: telegramMode(),
            dework: config.deworkToken ? 'live' : 'simulation',
            titan: config.titanUrl ? 'live' : 'simulation',
            emailQueue: mailQueueStats(),
            tunnel: { provider: 'pinggy', url: tunnel.url || '', updatedAt: tunnel.updatedAt || '' },
            renderBackup: config.backupUrl,
            koyeb: { bundleReady: true, live: false }
          },
          agents: dashboard.agents,
          projects: dashboard.projects,
          finance: dashboard.finance,
          links: { ...dashboard.links, backup: config.backupUrl, report: `http://127.0.0.1:${config.port}/report` },
          dailyReport: dailyReport(),
          finalReport
        });
      }

      if (url.pathname === '/agents/activate' && request.method === 'POST') {
        return json(response, 200, { activation: await activateTeam() });
      }

      if (url.pathname === '/api/dashboard') {
        const data = await dashboardData();
        data.performance = performancePlan();
        if (config.publicBaseUrl) {
          data.links.public = `${config.publicBaseUrl}/?key=${encodeURIComponent(config.teamUiToken)}`;
        }
        return json(response, 200, data);
      }

      if (url.pathname === '/api/team/agents') return json(response, 200, { agents: (await dashboardData()).agents });

      if (url.pathname === '/api/team/tasks') {
        const tasks = db.prepare(`
          SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent,
                 fit_score AS fitScore, updated_at AS updatedAt
          FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 100
        `).all();
        return json(response, 200, { tasks });
      }

      if (url.pathname === '/api/team/messages' && request.method === 'GET') {
        return json(response, 200, { messages: listMessages(url.searchParams.get('limit')) });
      }

      if (url.pathname === '/api/team/messages' && request.method === 'POST') {
        const body = await readBody(request);
        const saved = await createMessage(body);
        if (saved.sender === 'leader') {
          const safeBody = String(saved.body || '').replace(/[&<>]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]);
          const target = saved.recipient === 'all' ? 'الفريق الكامل' : saved.recipient;
          sendMessageDetailed(`<b>رسالة من واجهة AnyClaw</b>\nإلى: ${target}\n${safeBody}`)
            .then(result => audit('aurora', 'interface_telegram_relayed', { delivered: result.delivered, messageId: saved.id }))
            .catch(() => {});
        }
        return json(response, 201, { message: saved, telegramQueued: saved.sender === 'leader' });
      }

      if (url.pathname === '/api/notifications' && request.method === 'GET') {
        const rows = db.prepare(`
          SELECT id,kind,title,body,read,created_at AS createdAt
          FROM notifications ORDER BY id DESC LIMIT 100
        `).all();
        const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count;
        return json(response, 200, { notifications: rows, unread });
      }

      if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
        db.prepare('UPDATE notifications SET read=1 WHERE read=0').run();
        return json(response, 200, { ok: true });
      }

      if (url.pathname.startsWith('/uploads/') && request.method === 'GET') {
        const relative = decodeURIComponent(url.pathname);
        const file = await attachmentFile(relative);
        if (!file) return json(response, 404, { error: 'attachment not found' });
        response.writeHead(200, { 'content-type': mimeTypes[path.extname(relative).toLowerCase()] || 'application/octet-stream', 'cache-control': 'private, max-age=300' });
        return response.end(file);
      }

      if (url.pathname === '/research/weekly' && request.method === 'POST') {
        return json(response, 200, { report: await runWeeklyResearch() });
      }

      if (url.pathname === '/research/daily' && request.method === 'POST') {
        return json(response, 200, { report: await runDailyResearch() });
      }

      if (url.pathname === '/productivity/run' && request.method === 'POST') {
        const body = await readBody(request);
        const count = Math.max(1, Math.min(50, Number(body.count || 10)));
        return json(response, 200, { summary: await runHighThroughput(count) });
      }

      if (url.pathname === '/api/deliverables' && request.method === 'GET') {
        const rows = db.prepare(`
          SELECT id, category, title, file_path AS filePath, status, created_at AS createdAt
          FROM deliverables ORDER BY id DESC LIMIT 100
        `).all();
        return json(response, 200, { deliverables: rows });
      }

      if (url.pathname === '/api/team/tasks/by-stream' && request.method === 'GET') {
        const streams = ['dework', 'titan', 'jobs', 'opportunity'];
        const result = {};
        for (const stream of streams) {
          result[stream] = db.prepare(`
            SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent,
                   fit_score AS fitScore, updated_at AS updatedAt
            FROM tasks WHERE source = ? ORDER BY updated_at DESC, id DESC LIMIT 100
          `).all(stream);
        }
        return json(response, 200, { streams: result, generatedAt: new Date().toISOString() });
      }

      if (url.pathname === '/emergency' && request.method === 'POST') {
        const body = await readBody(request);
        const message = body.message || 'Emergency activation requested.';
        recordError('emergency', 'EMERGENCY_REQUEST', message, body, 'Activate backup and notify operator');
        audit('aurora', 'emergency_request', { message });
        const telegramResult = await sendMessage(`🚨 Aurora emergency request\n${message}`);
        const mailResult = await sendMail({
          to: config.officialEmail,
          subject: 'Aurora emergency activation',
          text: `${message}\n\nDashboard: http://127.0.0.1:${config.port}\nBackup URL: ${config.backupUrl || 'not configured'}`
        });
        return json(response, 202, { accepted: true, telegram: telegramResult, email: mailResult });
      }

      if (url.pathname === '/sync' && request.method === 'POST') {
        return json(response, 200, { connectors: await runConnectors() });
      }

      if (url.pathname === '/content' && request.method === 'GET') {
        return serveFile(response, path.join(config.root, 'www', 'index.html'), 'text/html; charset=utf-8', 'public, max-age=300');
      }

      let match;
      if ((match = url.pathname.match(/^\/tasks\/(\d+)\/(plan|execute|review)$/)) && request.method === 'POST') {
        const taskId = Number(match[1]);
        const output = match[2] === 'plan' ? await planTask(taskId) : match[2] === 'execute' ? await executeTask(taskId) : await reviewTask(taskId);
        return json(response, 200, { output });
      }

      if ((match = url.pathname.match(/^\/tasks\/(\d+)\/submit$/)) && request.method === 'POST') {
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(match[1]));
        if (!task) return json(response, 404, { error: 'task not found' });
        if (task.status !== 'ready_for_approval') return json(response, 409, { error: 'task is not ready for submission' });
        if (config.contractApprovalRequired) {
          const approval = requestApproval(task.id, 'submission');
          return json(response, 202, { approval_id: Number(approval.lastInsertRowid), state: 'pending_human_approval' });
        }
        db.prepare("UPDATE tasks SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        return json(response, 200, { state: 'submitted' });
      }

      if (['/', '/dashboard'].includes(url.pathname) || url.pathname === '/app') {
        let html = await fs.readFile(path.join(config.root, 'public', 'index.html'), 'utf8');
        const etag = `"${crypto.createHash('sha256').update(html).digest('hex')}"`;
        response.setHeader('etag', etag);
        response.setHeader('cache-control', 'no-cache');
        if (request.headers['if-none-match'] === etag) return response.writeHead(304).end();
        html = html.replace("localStorage.getItem('teamKey')||'__TEAM_KEY__'", `localStorage.getItem('teamKey')||'${isLoopback(request) ? config.teamUiToken : ''}'`);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(html);
      }

      if (url.pathname.startsWith('/icons/') && !url.pathname.includes('..')) {
        const iconPath = path.resolve(config.root, 'public', '.' + url.pathname);
        if (iconPath.startsWith(path.join(config.root, 'public', 'icons'))) {
          await serveFile(response, iconPath, '', 'public, max-age=604800, immutable');
          return;
        }
      }

      return json(response, 404, { error: 'not found' });
    } catch (caught) {
      console.error(caught);
      return json(response, caught.code === 'ATTACHMENT_SIZE' || caught.code === 'REQUEST_TOO_LARGE' ? 413 : 500, { error: caught.message });
    }
  });

  await new Promise(resolve => server.listen(config.port, '0.0.0.0', resolve));
  return server;
}
