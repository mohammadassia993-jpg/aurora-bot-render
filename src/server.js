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
import { securityHeaders, globalRateLimit, adminRateLimit, validateWebhookSecret, sanitizeObject, buildSecurityReport } from './security.js';
import { performancePlan } from './performance.js';
import { AGENTS, listMessages, createMessage, attachmentFile, teamEvents } from './team.js';
import { getAllWallets } from './wallets.js';
import { formatReport as formatAiUsage } from './cost-governor.js';

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
  const expected = Buffer.from(config.teamUiToken || '');
  const actual = Buffer.from(String(supplied));
  return actual.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(actual, expected);
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
      const msg = `🤖 <b>${ev.actor}</b>\n${String(ev.detail || '').slice(0, 800)}`;
      await sendMessageDetailed(msg, chatId).catch(() => {});
    }
  } catch (e) { /* silent */ }
}

function buildAiUsageHtml(byProvider, recent) {
  const providerNames = { zai: 'Z.ai (GLM)', llm7: 'LLM7', huggingface: 'Hugging Face' };
  const limits = { zai: 1000, llm7: 500, huggingface: 50 };

  let cardsHtml = '';
  const allProviders = ['zai', 'llm7', 'huggingface'];
  for (const p of allProviders) {
    const row = byProvider.find(x => x.provider === p) || { total: 0, ok: 0, fail: 0 };
    const limit = limits[p] || '?';
    const percent = limits[p] ? Math.round((row.total / limits[p]) * 100) : 0;
    const barColor = percent >= 80 ? '#f87171' : percent >= 50 ? '#fbbf24' : '#34d399';
    cardsHtml += `
      <div class="provider-card">
        <div class="provider-header">
          <span class="provider-name">${providerNames[p] || p}</span>
          <span class="provider-percent" style="color:${barColor}">${percent}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%;background:${barColor}"></div></div>
        <div class="provider-stats">
          <div><strong>${row.total}</strong> / ${limit}</div>
          <div class="ok">✅ ${row.ok}</div>
          <div class="fail">❌ ${row.fail}</div>
        </div>
      </div>`;
  }

  let recentHtml = '';
  if (recent.length === 0) {
    recentHtml = '<div class="empty">لا يوجد نشاط بعد</div>';
  } else {
    for (const r of recent) {
      const statusIcon = r.success ? '✅' : '❌';
      const statusClass = r.success ? 'ok' : 'fail';
      const time = String(r.created_at || '').slice(11, 19);
      const errShort = r.error_message ? String(r.error_message).slice(0, 60) : '';
      recentHtml += `
        <div class="log-row ${statusClass}">
          <div class="log-time">${time}</div>
          <div class="log-provider">${r.provider}</div>
          <div class="log-model">${String(r.model || '').slice(0, 30)}</div>
          <div class="log-status">${statusIcon}</div>
          ${errShort ? `<div class="log-error">${errShort}</div>` : ''}
        </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>استهلاك AI</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #0f172a; color: #e5e7eb; margin: 0; padding: 16px;
    max-width: 720px; margin: 0 auto; line-height: 1.6;
  }
  h1 { color: #a78bfa; font-size: 1.6em; margin: 8px 0 20px; text-align: center; }
  h2 { color: #a78bfa; font-size: 1.15em; margin: 0 0 14px; }
  .section {
    background: #1e293b; border-radius: 14px; padding: 16px; margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .provider-card {
    background: #0f172a; border-radius: 10px; padding: 14px; margin-bottom: 10px;
    border: 1px solid #334155;
  }
  .provider-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; font-size: 1.05em;
  }
  .provider-name { color: #e5e7eb; font-weight: 600; }
  .provider-percent { font-weight: 700; font-size: 1.1em; }
  .progress-bar {
    background: #1e293b; height: 10px; border-radius: 5px; overflow: hidden;
    margin-bottom: 10px;
  }
  .progress-fill { height: 100%; transition: width 0.4s; border-radius: 5px; }
  .provider-stats {
    display: flex; justify-content: space-between; font-size: 0.9em; color: #94a3b8;
  }
  .provider-stats strong { color: #e5e7eb; font-size: 1.1em; }
  .ok { color: #34d399; }
  .fail { color: #f87171; }
  .log-row {
    display: grid;
    grid-template-columns: 70px 80px 1fr 30px;
    gap: 8px; padding: 10px 8px; font-size: 0.85em;
    border-bottom: 1px solid #334155; align-items: center;
  }
  .log-row:last-child { border-bottom: none; }
  .log-row.fail { background: rgba(248,113,113,0.06); }
  .log-time { color: #94a3b8; font-family: monospace; font-size: 0.9em; }
  .log-provider { color: #a78bfa; font-weight: 600; }
  .log-model { color: #cbd5e1; font-size: 0.85em; overflow: hidden; text-overflow: ellipsis; }
  .log-status { text-align: center; font-size: 1.1em; }
  .log-error {
    grid-column: 1 / -1; color: #f87171; font-size: 0.8em;
    margin-top: 4px; padding: 4px 8px; background: rgba(248,113,113,0.1);
    border-radius: 4px; direction: ltr; text-align: left;
  }
  .empty { text-align: center; color: #64748b; padding: 20px; font-style: italic; }
  .footer { text-align: center; color: #64748b; font-size: 0.85em; margin: 20px 0; }
  .footer a { color: #a78bfa; text-decoration: none; }
</style>
</head>
<body>
  <h1>📊 استهلاك مزودي AI</h1>
  <div class="section">
    <h2>آخر 24 ساعة</h2>
    ${cardsHtml}
  </div>
  <div class="section">
    <h2>آخر 20 طلب</h2>
    ${recentHtml}
  </div>
  <div class="footer">تحديث تلقائي كل 30 ثانية · <a href="/">← الرئيسية</a></div>
</body>
</html>`;
}

export async function startServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    securityHeaders(request, response);
    if (!globalRateLimit(request, response)) return;
    try {
      // ═══ المسارات العامة ═══
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

      // ═══ AI Usage ═══
      if (url.pathname === '/api/ai-usage' && request.method === 'GET') {
        try {
          const report = formatAiUsage();
          const recent = db.prepare(`
            SELECT provider, model, success, error_message, created_at
            FROM ai_usage ORDER BY id DESC LIMIT 20
          `).all();
          const byProvider = db.prepare(`
            SELECT provider, COUNT(*) as total,
              SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as ok,
              SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fail
            FROM ai_usage
            WHERE created_at >= datetime('now', '-24 hours')
            GROUP BY provider
          `).all();
          return json(response, 200, { report, byProvider, recent });
        } catch (e) {
          return json(response, 500, { error: e.message });
        }
      }
      if (url.pathname === '/ai-usage' && request.method === 'GET') {
        try {
          const byProvider = db.prepare(`
            SELECT provider, COUNT(*) as total,
              SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as ok,
              SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fail
            FROM ai_usage
            WHERE created_at >= datetime('now', '-24 hours')
            GROUP BY provider
          `).all();
          const recent = db.prepare(`
            SELECT provider, model, success, error_message, created_at
            FROM ai_usage ORDER BY id DESC LIMIT 20
          `).all();
          const html = buildAiUsageHtml(byProvider, recent);
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return response.end(html);
        } catch (e) {
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          return response.end('خطأ: ' + e.message);
        }
      }

      // ═══ المحافظ ═══
      if (url.pathname === '/api/wallets/balances' && request.method === 'GET') {
        try {
          const data = await getAllWallets();
          return json(response, 200, data);
        } catch (e) {
          return json(response, 500, { ok: false, error: e.message });
        }
      }

      // ═══ الملفات الثابتة ═══
      if (url.pathname === '/wallets.html' && request.method === 'GET') {
        try {
          const html = await fs.readFile(path.join(config.root, 'public', 'wallets.html'), 'utf8');
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' });
          return response.end(html);
        } catch (err) {
          response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          return response.end('404');
        }
      }
      if (url.pathname === '/dashboard.js' && request.method === 'GET') {
        try {
          const jsContent = await fs.readFile(path.join(config.root, 'public', 'dashboard.js'), 'utf8');
          response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' });
          return response.end(jsContent);
        } catch (e) {
          response.writeHead(404, { 'content-type': 'application/javascript; charset=utf-8' });
          return response.end('// not found');
        }
      }
      if (['/', '/dashboard', '/app'].includes(url.pathname)) {
        let html = await fs.readFile(path.join(config.root, 'public', 'index.html'), 'utf8');
        if (!html.includes('http-equiv="refresh"')) {
          html = html.replace('</head>', '<meta http-equiv="refresh" content="60"></head>');
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(html);
      }

      // ═══ Dashboard APIs ═══
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
        const tasks = db.prepare(`
          SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent,
                 fit_score AS fitScore, updated_at AS updatedAt
          FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 100
        `).all();
        return json(response, 200, { tasks });
      }
      if (url.pathname === '/api/team/messages' && request.method === 'GET') {
        return json(response, 200, { messages: listMessages(url.searchParams.get('limit') || 100) });
      }
      if (url.pathname === '/api/notifications' && request.method === 'GET') {
        const rows = db.prepare(`
          SELECT id, kind, title, body, read, created_at AS createdAt
          FROM notifications ORDER BY id DESC LIMIT 100
        `).all();
        const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count;
        return json(response, 200, { notifications: rows, unread });
      }
      if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
        db.prepare('UPDATE notifications SET read=1 WHERE read=0').run();
        return json(response, 200, { ok: true });
      }

      // ═══ SSE Live ═══
      if (url.pathname === '/api/live' && request.method === 'GET') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no'
        });
        let closed = false;
        const send = (event, data) => {
          if (!closed && !response.destroyed) {
            response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
          }
        };
        send('messages', { messages: listMessages(120) });
        send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        const onLiveEvent = () => {
          send('messages', { messages: listMessages(120) });
          send('notifications', { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count });
        };
        teamEvents.on('message', onLiveEvent);
        teamEvents.on('notification', onLiveEvent);
        const heartbeat = setInterval(() => {
          if (!closed && !response.destroyed) response.write(': keep-alive\n\n');
        }, 25000);
        request.once('close', () => {
          closed = true;
          teamEvents.off('message', onLiveEvent);
          teamEvents.off('notification', onLiveEvent);
          clearInterval(heartbeat);
          response.end();
        });
        return;
      }

      // ═══ إرسال رسالة للفريق ═══
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

      // ═══ Telegram Webhook ═══
      if (url.pathname === '/telegram/webhook') {
        if (request.method === 'GET') { return json(response, 200, { ok: true }); }
        if (request.method !== 'POST') { return; }
        const secretToken = request.headers['x-telegram-bot-api-secret-token'];
        if (config.telegramWebhookSecret && secretToken !== config.telegramWebhookSecret) {
          return json(response, 403, { ok: false, error: 'invalid secret token' });
        }
        const update = await readBody(request);
        setTimeout(() => {
          handleTelegramUpdate(update).then(() => processTelegramOutbox()).catch(e => recordError('telegram', 'WEBHOOK_BG_ERROR', e.message));
        }, 0);
        return json(response, 200, { ok: true });
      }

      // ═══ status ═══
      if (url.pathname === '/status') {
        return json(response, 200, {
          telegram: { mode: telegramMode(), tokenValidated: Boolean(config.telegramToken), webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL) },
          tasksByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all(),
          openErrors: db.prepare("SELECT scope, error_type, message FROM errors WHERE resolved = 0 ORDER BY id DESC LIMIT 20").all(),
          models: modelPerformance()
        });
      }

      // ═══ أي مسار آخر → 404 ═══
      return json(response, 404, { error: 'not found' });
    } catch (caught) {
      console.error(caught);
      return json(response, 500, { error: caught.message });
    }
  });
  await new Promise(resolve => server.listen(config.port, '0.0.0.0', resolve));
  return server;
}
