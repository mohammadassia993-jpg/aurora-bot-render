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
import { securityHeaders, globalRateLimit } from './security.js';
import { performancePlan } from './performance.js';
import { AGENTS, listMessages, createMessage, attachmentFile, teamEvents } from './team.js';
import { getAllWallets } from './wallets.js';

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
    if (size > 35 * 1024 * 1024) throw new Error('request too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload, null, 2));
}

async function relayRecentTeamReplies() {
  try {
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

export async function startServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    securityHeaders(request, response);
    if (!globalRateLimit(request, response)) return;
    try {
      // ═══ static ═══
      if (url.pathname === '/dashboard.js' && request.method === 'GET') {
        try {
          const js = await fs.readFile(path.join(config.root, 'public', 'dashboard.js'), 'utf8');
          response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
          return response.end(js);
        } catch { response.writeHead(404); return response.end('// 404'); }
      }
      if (url.pathname === '/wallets.html' && request.method === 'GET') {
        try {
          const html = await fs.readFile(path.join(config.root, 'public', 'wallets.html'), 'utf8');
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return response.end(html);
        } catch { response.writeHead(404); return response.end('404'); }
      }
      if (['/', '/dashboard', '/app'].includes(url.pathname)) {
        const html = await fs.readFile(path.join(config.root, 'public', 'index.html'), 'utf8');
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(html);
      }

      // ═══ health & debug ═══
      if (url.pathname === '/health') {
        const checked = await runWatchdog();
        const ok = Object.values(checked).every(Boolean);
        return json(response, ok ? 200 : 503, { ok, health: checked });
      }
      if (url.pathname === '/keepalive') {
        return json(response, 200, { ok: true, at: new Date().toISOString() });
      }
      if (url.pathname === '/debug-ai') {
        const msg = url.searchParams.get('msg') || 'قل مرحبا';
        try {
          const { callModel } = await import('./ai.js');
          const result = await Promise.race([
            callModel('aurora', msg),
            new Promise((_, r) => setTimeout(() => r(new Error('TIMEOUT')), 25000))
          ]);
          return json(response, 200, {
            model: 'auto-chain',
            result: String(result).slice(0, 1000),
            length: String(result).length
          });
        } catch (e) {
          return json(response, 500, { error: e.message });
        }
      }
      if (url.pathname === '/debug-team') {
        const msg = url.searchParams.get('msg') || 'اقرأ ملف RULES.md وقل عدد أسطره';
        try {
          const { createMessage } = await import('./team.js');
          const saved = await createMessage({ sender: 'leader', recipient: 'all', thread: 'team', body: msg });
          return json(response, 200, { ok: true, messageId: saved.id });
        } catch (e) {
          return json(response, 500, { error: e.message });
        }
      }

      // ═══ wallets ═══
      if (url.pathname === '/api/wallets/balances' && request.method === 'GET') {
        try { return json(response, 200, await getAllWallets()); }
        catch (e) { return json(response, 500, { ok: false, error: e.message }); }
      }

      // ═══ dashboard data ═══
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
      if (url.pathname === '/api/notifications' && request.method === 'GET') {
        const rows = db.prepare(`SELECT id,kind,title,body,read,created_at AS createdAt FROM notifications ORDER BY id DESC LIMIT 100`).all();
        const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count;
        return json(response, 200, { notifications: rows, unread });
      }
      if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
        db.prepare('UPDATE notifications SET read=1 WHERE read=0').run();
        return json(response, 200, { ok: true });
      }

      // ═══ messages GET (المهم للسجل الحي) ═══
      if (url.pathname === '/api/team/messages' && request.method === 'GET') {
        return json(response, 200, { messages: listMessages(url.searchParams.get('limit') || 100) });
      }

      // ═══ messages POST (إرسال رسالة القائد) ═══
      if (url.pathname === '/api/team/messages' && request.method === 'POST') {
        const body = await readBody(request);
        const saved = await createMessage(body);
        if (saved.sender === 'leader') {
          const safeBody = String(saved.body || '').replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c]);
          const target = saved.recipient === 'all' ? 'الفريق الكامل' : saved.recipient;
          sendMessageDetailed(`📤 <b>رسالة من القائد</b>\nإلى: ${target}\n\n${safeBody}`).catch(() => {});
          setTimeout(relayRecentTeamReplies, 25000);
        }
        return json(response, 201, { message: saved });
      }

      // ═══ SSE live ═══
      if (url.pathname === '/api/live' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        let closed = false;
        const send = (event, data) => { if (!closed && !response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
        send('messages', { messages: listMessages(120) });
        const onLiveEvent = () => send('messages', { messages: listMessages(120) });
        teamEvents.on('message', onLiveEvent);
        const heartbeat = setInterval(() => { if (!closed && !response.destroyed) response.write(': keep-alive\n\n'); }, 25000);
        request.once('close', () => {
          closed = true;
          teamEvents.off('message', onLiveEvent);
          clearInterval(heartbeat);
          response.end();
        });
        return;
      }

      // ═══ telegram webhook ═══
      if (url.pathname === '/telegram/webhook') {
        if (request.method === 'GET') return json(response, 200, { ok: true });
        if (request.method !== 'POST') return;
        const update = await readBody(request);
        setTimeout(() => {
          handleTelegramUpdate(update).then(() => processTelegramOutbox()).catch(e => recordError('telegram', 'WEBHOOK_BG_ERROR', e.message));
        }, 0);
        return json(response, 200, { ok: true });
      }

      // ═══ status ═══
      if (url.pathname === '/status') {
        return json(response, 200, {
          telegram: { mode: telegramMode(), tokenValidated: Boolean(config.telegramToken) },
          tasksByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all(),
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
