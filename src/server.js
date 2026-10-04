import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { runWatchdog } from './watchdog.js';
import { handleTelegramUpdate, processTelegramOutbox, sendMessageDetailed, telegramMode } from './telegram.js';
import { modelPerformance } from './ai.js';
import { audit } from './audit.js';
import { recordError } from './db.js';
import { dashboardData } from './dashboard.js';
import { securityHeaders, globalRateLimit } from './security.js';
import { performancePlan } from './performance.js';
import { listMessages, createMessage, teamEvents } from './team.js';
import { getAllWallets } from './wallets.js';
import { formatReport as formatAiUsage } from './cost-governor.js';
import { getFullReport } from './observability.js';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
  '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'
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

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload, null, 2));
}

function authorized(request, url) {
  const supplied = url.searchParams.get('key') || request.headers['x-team-key'] || '';
  const expected = Buffer.from(config.teamUiToken || '');
  const actual = Buffer.from(String(supplied));
  return actual.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(actual, expected);
}

async function relayRecentTeamReplies() {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const chatId = config.telegramChatId || '888229115';
    const events = db.prepare(`
      SELECT actor, action, detail, created_at FROM events
      WHERE actor IN ('aurora','planner','executor','reviewer','scout')
        AND created_at >= datetime('now', '-60 seconds')
      ORDER BY id DESC LIMIT 5
    `).all();
    for (const ev of events.reverse()) {
      await sendMessageDetailed(`🤖 <b>${ev.actor}</b>\n${String(ev.detail || '').slice(0, 800)}`, chatId).catch(() => {});
    }
  } catch (e) {}
}

function buildObservabilityHtml(report) {
  const health = report.health || { healthy: 0, total: 0 };
  const healthPct = health.total ? Math.round((health.healthy / health.total) * 100) : 0;
  const healthColor = healthPct >= 80 ? '#34d399' : healthPct >= 50 ? '#fbbf24' : '#f87171';

  let tasksHtml = '';
  if (report.tasks?.length) {
    tasksHtml = report.tasks.map(t =>
      `<div class="stat"><span class="label">${t.status}</span><span class="value">${t.count}</span></div>`
    ).join('');
  } else tasksHtml = '<div class="empty">لا مهام</div>';

  let agentsHtml = '';
  if (report.agents?.length) {
    agentsHtml = report.agents.map(a =>
      `<div class="stat"><span class="label">${a.sender}</span><span class="value">${a.count} · ${String(a.lastSeen||'').slice(11,16)}</span></div>`
    ).join('');
  } else agentsHtml = '<div class="empty">لا نشاط</div>';

  const mem = report.memory || { lessons: 0, trust: 0, audit: 0 };

  let errorsHtml = '';
  if (report.errors?.length) {
    errorsHtml = report.errors.map(e =>
      `<div class="stat"><span class="label">${e.scope}</span><span class="value">${e.count}</span></div>`
    ).join('');
  } else errorsHtml = '<div class="empty">لا أخطاء مفتوحة ✅</div>';

  let lessonsHtml = '';
  if (report.lessons?.length) {
    lessonsHtml = report.lessons.map(l => {
      const icon = (l.lesson_type || '').includes('error') ? '⚠️' : '✅';
      return `<div class="item"><div class="meta">${icon} ${l.agent} · ${l.lesson_type}</div><div class="body">${String(l.lesson_text||'').slice(0,200)}</div></div>`;
    }).join('');
  } else lessonsHtml = '<div class="empty">لا دروس</div>';

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="45"><title>المراقبة</title><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Tahoma, sans-serif; background: #0a1020; color: #e8ecf5; padding: 14px; margin: 0; }
  h1 { color: #a78bfa; font-size: 20px; text-align: center; margin-bottom: 6px; }
  .sub { color: #94a3b8; font-size: 11px; text-align: center; margin-bottom: 16px; }
  .section { background: #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 12px; border: 1px solid #334155; }
  .section h2 { color: #a78bfa; font-size: 14px; margin-bottom: 10px; }
  .stat { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #334155; font-size: 13px; }
  .stat:last-child { border-bottom: none; }
  .stat .label { color: #94a3b8; }
  .stat .value { color: #e0e7ff; font-weight: 600; }
  .item { padding: 9px; background: #0f172a; border-radius: 9px; margin-bottom: 6px; }
  .item .meta { color: #a78bfa; font-size: 11px; margin-bottom: 3px; }
  .item .body { color: #e0e7ff; font-size: 12px; line-height: 1.4; }
  .empty { text-align: center; padding: 12px; color: #64748b; font-size: 12px; }
  .health-bar { background: #0f172a; height: 12px; border-radius: 6px; overflow: hidden; margin: 10px 0; }
  .health-fill { height: 100%; background: ${healthColor}; border-radius: 6px; }
  .footer { text-align: center; color: #64748b; font-size: 11px; margin: 16px 0; }
  </style></head><body>
  <h1>📊 المراقبة</h1>
  <p class="sub">تحديث تلقائي كل 45 ثانية</p>

  <div class="section">
    <h2>💚 صحة النظام — ${healthPct}%</h2>
    <div class="health-bar"><div class="health-fill" style="width:${healthPct}%"></div></div>
    <div class="stat"><span class="label">سليم / إجمالي</span><span class="value">${health.healthy} / ${health.total}</span></div>
  </div>

  <div class="section"><h2>📋 المهام</h2>${tasksHtml}</div>

  <div class="section"><h2>👥 نشاط الوكلاء (24 ساعة)</h2>${agentsHtml}</div>

  <div class="section"><h2>🧠 الذاكرة</h2>
    <div class="stat"><span class="label">الدروس المسجّلة</span><span class="value">${mem.lessons}</span></div>
    <div class="stat"><span class="label">سجلات الثقة</span><span class="value">${mem.trust}</span></div>
    <div class="stat"><span class="label">سجلات التدقيق</span><span class="value">${mem.audit}</span></div>
  </div>

  <div class="section"><h2>⚠️ أخطاء مفتوحة</h2>${errorsHtml}</div>

  <div class="section"><h2>📚 آخر الدروس</h2>${lessonsHtml}</div>

  <div class="footer">${report.generatedAt || ''}</div>
  </body></html>`;
}

export async function startServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    securityHeaders(request, response);
    if (!globalRateLimit(request, response)) return;
    try {
      if (url.pathname === '/health') {
        const latest = db.prepare(`SELECT component, healthy FROM health_checks WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY component) AND created_at >= datetime('now', '-120 seconds')`).all();
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
      if (url.pathname === '/keepalive') return json(response, 200, { ok: true, at: new Date().toISOString() });

      if (url.pathname === '/api/ai-usage' && request.method === 'GET') {
        try {
          const report = formatAiUsage();
          const recent = db.prepare(`SELECT provider, model, success, error_message, created_at FROM ai_usage ORDER BY id DESC LIMIT 20`).all();
          const byProvider = db.prepare(`SELECT provider, COUNT(*) as total, SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fail FROM ai_usage WHERE created_at >= datetime('now', '-24 hours') GROUP BY provider`).all();
          return json(response, 200, { report, byProvider, recent });
        } catch (e) { return json(response, 500, { error: e.message }); }
      }

      if (url.pathname === '/observability' && request.method === 'GET') {
        try {
          const report = getFullReport();
          const html = buildObservabilityHtml(report);
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return response.end(html);
        } catch (e) {
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          return response.end('خطأ: ' + e.message);
        }
      }

      if (url.pathname === '/api/observability' && request.method === 'GET') {
        try { return json(response, 200, getFullReport()); }
        catch (e) { return json(response, 500, { error: e.message }); }
      }

      if (url.pathname === '/api/wallets/balances' && request.method === 'GET') {
        try { return json(response, 200, await getAllWallets()); }
        catch (e) { return json(response, 500, { ok: false, error: e.message }); }
      }

      if (url.pathname === '/wallets.html' && request.method === 'GET') {
        try {
          const html = await fs.readFile(path.join(config.root, 'public', 'wallets.html'), 'utf8');
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' });
          return response.end(html);
        } catch (err) { response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return response.end('404'); }
      }

      if (url.pathname === '/dashboard.js' && request.method === 'GET') {
        try {
          const jsContent = await fs.readFile(path.join(config.root, 'public', 'dashboard.js'), 'utf8');
          response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' });
          return response.end(jsContent);
        } catch (e) { response.writeHead(404, { 'content-type': 'application/javascript; charset=utf-8' }); return response.end('// not found'); }
      }

      if (['/', '/dashboard', '/app'].includes(url.pathname)) {
        let html = await fs.readFile(path.join(config.root, 'public', 'index.html'), 'utf8');
        if (!html.includes('http-equiv="refresh"')) html = html.replace('</head>', '<meta http-equiv="refresh" content="60"></head>');
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(html);
      }

      if (url.pathname === '/api/dashboard') {
        const data = await dashboardData();
        data.performance = performancePlan();
        return json(response, 200, data);
      }
      if (url.pathname === '/api/team/agents') {
        try { return json(response, 200, { agents: (await dashboardData()).agents }); }
        catch (e) { return json(response, 500, { error: e.message }); }
      }
      if (url.pathname === '/api/team/tasks') {
        const tasks = db.prepare(`SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent, fit_score AS fitScore, updated_at AS updatedAt FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 100`).all();
        return json(response, 200, { tasks });
      }
      if (url.pathname === '/api/team/messages' && request.method === 'GET') {
        return json(response, 200, { messages: listMessages(url.searchParams.get('limit') || 100) });
      }
      if (url.pathname === '/api/notifications' && request.method === 'GET') {
        const rows = db.prepare(`SELECT id, kind, title, body, read, created_at AS createdAt FROM notifications ORDER BY id DESC LIMIT 100`).all();
        const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count;
        return json(response, 200, { notifications: rows, unread });
      }
      if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
        db.prepare('UPDATE notifications SET read=1 WHERE read=0').run();
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/api/live' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        let closed = false;
        const send = (event, data) => { if (!closed && !response.destroyed) response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); };
        send('messages', { messages: listMessages(120) });
        send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        const onLiveEvent = () => {
          send('messages', { messages: listMessages(120) });
          send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        };
        teamEvents.on('message', onLiveEvent);
        teamEvents.on('notification', onLiveEvent);
        const heartbeat = setInterval(() => { if (!closed && !response.destroyed) response.write(': keep-alive\n\n'); }, 25000);
        request.once('close', () => {
          closed = true;
          teamEvents.off('message', onLiveEvent);
          teamEvents.off('notification', onLiveEvent);
          clearInterval(heartbeat);
          response.end();
        });
        return;
      }

      if (url.pathname === '/api/team/messages' && request.method === 'POST') {
        const body = await readBody(request);
        const saved = await createMessage(body);
        if (saved.sender === 'leader') {
          const safeBody = String(saved.body || '').replace(/[&<>]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]);
          const target = saved.recipient === 'all' ? 'الفريق الكامل' : saved.recipient;
          sendMessageDetailed(`📤 <b>رسالة من القائد</b>\nإلى: ${target}\n\n${safeBody}`)
            .then(result => audit('aurora', 'leader_message_relayed', { delivered: result.delivered, messageId: saved.id }))
            .catch(() => {});
          setTimeout(relayRecentTeamReplies, 20000);
        }
        return json(response, 201, { message: saved, telegramQueued: saved.sender === 'leader' });
      }

      if (url.pathname === '/telegram/webhook') {
        if (request.method === 'GET') return json(response, 200, { ok: true });
        if (request.method !== 'POST') return;
        const secretToken = request.headers['x-telegram-bot-api-secret-token'];
        if (config.telegramWebhookSecret && secretToken !== config.telegramWebhookSecret) return json(response, 403, { ok: false, error: 'invalid secret token' });
        const update = await readBody(request);
        setTimeout(() => { handleTelegramUpdate(update).then(() => processTelegramOutbox()).catch(e => recordError('telegram', 'WEBHOOK_BG_ERROR', e.message)); }, 0);
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/status') {
        return json(response, 200, {
          telegram: { mode: telegramMode(), tokenValidated: Boolean(config.telegramToken), webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL) },
          tasksByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all(),
          openErrors: db.prepare("SELECT scope, error_type, message FROM errors WHERE resolved = 0 ORDER BY id DESC LIMIT 20").all(),
          models: modelPerformance()
        });
      }

      return json(response, 404, { error: 'not found' });
    } catch (caught) {
      console.error(caught);
      return json(response, 500, { error: caught.message });
    }
  });
  await new Promise(resolve => server.listen(config.port, '0.0.0.0', resolve));
  return server;
}
