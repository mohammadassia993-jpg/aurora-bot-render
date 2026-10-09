import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { activateTeam, planTask, executeTask, reviewTask, requestApproval } from './agents.js';
import { runConnectors } from './connectors.js';
import { runWeeklyResearch } from './research.js';
import { runWatchdog } from './watchdog.js';
import { dailyReport, handleTelegramUpdate, processTelegramOutbox, sendMessage, sendMessageDetailed, telegramMode } from './telegram.js';
import { modelPerformance } from './ai.js';
import { mailQueueStats, sendMail } from './mail.js';
import { readPublicLink } from './tunnel.js';
import { audit } from './audit.js';
import { backupDatabase, recordError } from './db.js';
import { dashboardData } from './dashboard.js';
import { performancePlan } from './performance.js';
import { AGENTS, listMessages, createMessage, attachmentFile, teamEvents } from './team.js';
import { getAllWallets } from './wallets.js';
import { formatReport as formatAiUsage } from './cost-governor.js';
import { getFullReport } from './observability.js';
// ⬇️ إضافة: قراءة السجل الدائم من Turso
import { listAllMessages } from './chat-db.js';

const FALLBACK_TEAM_KEY = '8cdQ7WY9SvAGxe6SfFPlngj0_UbX6Cr';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
  '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'
};

const PUBLIC_GET_PATHS = new Set([
  '/', '/dashboard', '/app',
  '/api/dashboard', '/api/team/agents', '/api/team/tasks', '/api/team/messages',
  '/api/notifications', '/api/live', '/api/ai-usage', '/api/observability',
  '/api/wallets/balances', '/api/status',
  '/ai-usage', '/observability', '/wallets.html', '/dashboard.js', '/status', '/health', '/keepalive'
]);

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

function getExpectedTeamKey() {
  const fromConfig = String(config.teamUiToken || '').trim();
  if (fromConfig.length > 0) return fromConfig;
  const fromEnv = String(process.env.TEAM_UI_TOKEN || '').trim();
  if (fromEnv.length > 0) return fromEnv;
  return FALLBACK_TEAM_KEY;
}

function authorized(request, url) {
  try {
    const supplied = String(url.searchParams.get('key') || request.headers['x-team-key'] || '');
    const expected = getExpectedTeamKey();
    if (!supplied || !expected) return false;
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
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

function buildAiUsageHtml(byProvider, recent) {
  const names = { zai: 'Z.ai (GLM)', llm7: 'LLM7', huggingface: 'Hugging Face' };
  const limits = { zai: 1000, llm7: 500, huggingface: 50 };
  let cards = '';
  for (const p of ['zai', 'llm7', 'huggingface']) {
    const row = byProvider.find(x => x.provider === p) || { total: 0, ok: 0, fail: 0 };
    const limit = limits[p] || '?';
    const pct = limits[p] ? Math.round((row.total / limits[p]) * 100) : 0;
    const color = pct >= 80 ? '#f87171' : pct >= 50 ? '#fbbf24' : '#34d399';
    cards += `<div style="background:#0f172a;border-radius:10px;padding:14px;margin-bottom:10px;border:1px solid #334155"><div style="display:flex;justify-content:space-between;margin-bottom:10px;font-weight:600"><span>${names[p]}</span><span style="color:${color}">${pct}%</span></div><div style="background:#1e293b;height:10px;border-radius:5px;overflow:hidden;margin-bottom:10px"><div style="width:${pct}%;height:100%;background:${color};border-radius:5px"></div></div><div style="display:flex;justify-content:space-between;font-size:0.9em;color:#94a3b8"><span><strong style="color:#e5e7eb">${row.total}</strong> / ${limit}</span><span style="color:#34d399">✅ ${row.ok}</span><span style="color:#f87171">❌ ${row.fail}</span></div></div>`;
  }
  let logs = '';
  if (!recent.length) logs = '<div style="text-align:center;color:#64748b;padding:20px">لا يوجد نشاط بعد</div>';
  else for (const r of recent) {
    const icon = r.success ? '✅' : '❌';
    const cls = r.success ? '' : 'background:rgba(248,113,113,0.06);';
    const err = r.error_message ? `<div style="grid-column:1/-1;color:#f87171;font-size:0.8em;margin-top:4px;padding:4px 8px;background:rgba(248,113,113,0.1);border-radius:4px;direction:ltr;text-align:left">${String(r.error_message).slice(0,80)}</div>` : '';
    logs += `<div style="display:grid;grid-template-columns:70px 80px 1fr 30px;gap:8px;padding:10px 8px;font-size:0.85em;border-bottom:1px solid #334155;align-items:center;${cls}"><div style="color:#94a3b8;font-family:monospace">${String(r.created_at||'').slice(11,19)}</div><div style="color:#a78bfa;font-weight:600">${r.provider}</div><div style="color:#cbd5e1;font-size:0.85em;overflow:hidden">${String(r.model||'').slice(0,30)}</div><div style="text-align:center">${icon}</div>${err}</div>`;
  }
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>استهلاك AI</title><style>*{box-sizing:border-box}body{font-family:system-ui;background:#0f172a;color:#e5e7eb;margin:0;padding:16px;max-width:720px;margin:0 auto}h1{color:#a78bfa;font-size:1.6em;text-align:center;margin:8px 0 20px}h2{color:#a78bfa;font-size:1.15em;margin:0 0 14px}.section{background:#1e293b;border-radius:14px;padding:16px;margin-bottom:16px}.footer{text-align:center;color:#64748b;font-size:0.85em;margin:20px 0}.footer a{color:#a78bfa;text-decoration:none}</style></head><body><h1>📊 استهلاك مزودي AI</h1><div class="section"><h2>آخر 24 ساعة</h2>${cards}</div><div class="section"><h2>آخر 20 طلب</h2>${logs}</div><div class="footer">تحديث تلقائي كل 30 ثانية · <a href="/">← الرئيسية</a></div></body></html>`;
}

function buildObservabilityHtml(report) {
  const health = report.health || { healthy: 0, total: 0 };
  const pct = health.total ? Math.round((health.healthy / health.total) * 100) : 0;
  const color = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171';
  const tasksHtml = report.tasks?.length ? report.tasks.map(t => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #334155;font-size:13px"><span style="color:#94a3b8">${t.status}</span><span style="color:#e0e7ff;font-weight:600">${t.count}</span></div>`).join('') : '<div style="text-align:center;padding:12px;color:#64748b;font-size:12px">لا مهام</div>';
  const agentsHtml = report.agents?.length ? report.agents.map(a => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #334155;font-size:13px"><span style="color:#94a3b8">${a.sender}</span><span style="color:#e0e7ff;font-weight:600">${a.count}</span></div>`).join('') : '<div style="text-align:center;padding:12px;color:#64748b;font-size:12px">لا نشاط</div>';
  const mem = report.memory || { lessons: 0, trust: 0, audit: 0 };
  const errorsHtml = report.errors?.length ? report.errors.map(e => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #334155;font-size:13px"><span style="color:#94a3b8">${e.scope}</span><span style="color:#e0e7ff;font-weight:600">${e.count}</span></div>`).join('') : '<div style="text-align:center;padding:12px;color:#64748b;font-size:12px">لا أخطاء ✅</div>';
  const lessonsHtml = report.lessons?.length ? report.lessons.map(l => `<div style="padding:9px;background:#0f172a;border-radius:9px;margin-bottom:6px"><div style="color:#a78bfa;font-size:11px;margin-bottom:3px">${l.agent} · ${l.lesson_type}</div><div style="color:#e0e7ff;font-size:12px">${String(l.lesson_text||'').slice(0,200)}</div></div>`).join('') : '<div style="text-align:center;padding:12px;color:#64748b;font-size:12px">لا دروس</div>';
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="45"><title>المراقبة</title><style>*{box-sizing:border-box}body{font-family:system-ui;background:#0a1020;color:#e8ecf5;padding:14px;margin:0}h1{color:#a78bfa;font-size:20px;text-align:center;margin-bottom:6px}.sub{color:#94a3b8;font-size:11px;text-align:center;margin-bottom:16px}.section{background:#1e293b;border-radius:14px;padding:14px;margin-bottom:12px;border:1px solid #334155}.section h2{color:#a78bfa;font-size:14px;margin-bottom:10px}.health-bar{background:#0f172a;height:12px;border-radius:6px;overflow:hidden;margin:10px 0}.health-fill{height:100%;background:${color};border-radius:6px}.footer{text-align:center;color:#64748b;font-size:11px;margin:16px 0}</style></head><body><h1>📊 المراقبة</h1><p class="sub">تحديث تلقائي كل 45 ثانية</p><div class="section"><h2>💚 صحة النظام — ${pct}%</h2><div class="health-bar"><div class="health-fill" style="width:${pct}%"></div></div><div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px"><span style="color:#94a3b8">سليم / إجمالي</span><span style="color:#e0e7ff;font-weight:600">${health.healthy} / ${health.total}</span></div></div><div class="section"><h2>📋 المهام</h2>${tasksHtml}</div><div class="section"><h2>👥 نشاط الوكلاء (24 ساعة)</h2>${agentsHtml}</div><div class="section"><h2>🧠 الذاكرة</h2><div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #334155;font-size:13px"><span style="color:#94a3b8">الدروس المسجّلة</span><span style="color:#e0e7ff;font-weight:600">${mem.lessons}</span></div><div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #334155;font-size:13px"><span style="color:#94a3b8">سجلات الثقة</span><span style="color:#e0e7ff;font-weight:600">${mem.trust}</span></div><div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px"><span style="color:#94a3b8">سجلات التدقيق</span><span style="color:#e0e7ff;font-weight:600">${mem.audit}</span></div></div><div class="section"><h2>⚠️ أخطاء مفتوحة</h2>${errorsHtml}</div><div class="section"><h2>📚 آخر الدروس</h2>${lessonsHtml}</div><div class="footer">${report.generatedAt || ''}</div></body></html>`;
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

      if (url.pathname === '/keepalive') return json(response, 200, { ok: true, at: new Date().toISOString() });

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

      if (url.pathname === '/api/ai-usage' && request.method === 'GET') {
        try {
          const report = formatAiUsage();
          const recent = db.prepare(`SELECT provider, model, success, error_message, created_at FROM ai_usage ORDER BY id DESC LIMIT 20`).all();
          const byProvider = db.prepare(`SELECT provider, COUNT(*) as total, SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fail FROM ai_usage WHERE created_at >= datetime('now', '-24 hours') GROUP BY provider`).all();
          return json(response, 200, { report, byProvider, recent });
        } catch (e) { return json(response, 500, { error: e.message }); }
      }

      if (url.pathname === '/ai-usage' && request.method === 'GET') {
        try {
          const byProvider = db.prepare(`SELECT provider, COUNT(*) as total, SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fail FROM ai_usage WHERE created_at >= datetime('now', '-24 hours') GROUP BY provider`).all();
          const recent = db.prepare(`SELECT provider, model, success, error_message, created_at FROM ai_usage ORDER BY id DESC LIMIT 20`).all();
          const html = buildAiUsageHtml(byProvider, recent);
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return response.end(html);
        } catch (e) { response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); return response.end('خطأ: ' + e.message); }
      }

      if (url.pathname === '/observability' && request.method === 'GET') {
        try {
          const report = getFullReport();
          const html = buildObservabilityHtml(report);
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return response.end(html);
        } catch (e) { response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); return response.end('خطأ: ' + e.message); }
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
          const js = await fs.readFile(path.join(config.root, 'public', 'dashboard.js'), 'utf8');
          response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' });
          return response.end(js);
        } catch (e) { response.writeHead(404, { 'content-type': 'application/javascript; charset=utf-8' }); return response.end('// not found'); }
      }

      if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
        const secret = request.headers['x-telegram-bot-api-secret-token'] || '';
        if (config.telegramWebhookSecret && secret !== config.telegramWebhookSecret) return json(response, 401, { ok: false });
        const update = await readBody(request);
        let outbox = { processed: 0 };
        try { await handleTelegramUpdate(update); outbox = await processTelegramOutbox(); }
        catch (caught) { recordError('telegram', 'WEBHOOK_HANDLER_ERROR', caught.message); }
        return json(response, 200, { ok: true, outbox });
      }

      if (url.pathname === '/api/sync/database' && request.method === 'GET') {
        if (config.platformRole !== 'primary' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'disabled or unauthorized' });
        const backupPath = backupDatabase();
        const payload = await fs.readFile(backupPath);
        await fs.rm(backupPath, { force: true });
        const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(payload.byteLength), 'x-sha256': sha256, 'x-filename': path.basename(backupPath), 'cache-control': 'no-store' });
        response.end(payload);
        audit('aurora', 'database_backup_exported', { bytes: payload.byteLength, sha256 });
        return;
      }

      if (url.pathname === '/api/sync/database.gz' && request.method === 'GET') {
        if (config.platformRole !== 'primary' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'disabled or unauthorized' });
        const backupPath = backupDatabase();
        const payload = await fs.readFile(backupPath);
        await fs.rm(backupPath, { force: true });
        const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
        const compressed = zlib.gzipSync(payload, { level: 9 });
        response.writeHead(200, { 'content-type': 'application/gzip', 'content-length': String(compressed.byteLength), 'x-sha256': sha256, 'x-filename': `${path.basename(backupPath)}.gz`, 'cache-control': 'no-store' });
        response.end(compressed);
        audit('aurora', 'compressed_database_backup_exported', { bytes: payload.byteLength, compressedBytes: compressed.byteLength, sha256 });
        return;
      }

      if (url.pathname === '/api/sync/database.gz' && request.method === 'POST') {
        if (config.platformRole !== 'render' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'disabled or unauthorized' });
        const compressed = await readRawBody(request, 40 * 1024 * 1024);
        let payload;
        try { payload = zlib.gunzipSync(compressed); }
        catch { return json(response, 400, { ok: false, error: 'invalid gzip database backup' }); }
        const expectedHash = String(request.headers['x-sha256'] || '');
        const actualHash = crypto.createHash('sha256').update(payload).digest('hex');
        if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) return json(response, 400, { ok: false, error: 'invalid SQLite database' });
        if (expectedHash && expectedHash !== actualHash) return json(response, 400, { ok: false, error: 'checksum mismatch' });
        await fs.mkdir(path.join(config.root, 'data'), { recursive: true });
        await fs.writeFile(path.join(config.root, 'data', 'incoming-platform.db'), payload);
        audit('aurora', 'compressed_database_backup_received', { bytes: payload.byteLength, sha256: actualHash });
        if (process.env.ALLOW_DATABASE_RESTORE_RESTART === 'true') setTimeout(() => process.exit(0), 1000).unref();
        return json(response, 202, { ok: true, accepted: true, compressed: true, sha256: actualHash, restoreOnRestart: true });
      }

      if (url.pathname === '/api/sync/database' && request.method === 'POST') {
        if (config.platformRole !== 'render' || !config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'disabled or unauthorized' });
        const payload = await readRawBody(request);
        const expectedHash = String(request.headers['x-sha256'] || '');
        const actualHash = crypto.createHash('sha256').update(payload).digest('hex');
        if (!payload.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) return json(response, 400, { ok: false, error: 'invalid SQLite database' });
        if (expectedHash && expectedHash !== actualHash) return json(response, 400, { ok: false, error: 'checksum mismatch' });
        await fs.mkdir(path.join(config.root, 'data'), { recursive: true });
        await fs.writeFile(path.join(config.root, 'data', 'incoming-platform.db'), payload);
        audit('aurora', 'database_backup_received', { bytes: payload.byteLength, sha256: actualHash });
        if (process.env.ALLOW_DATABASE_RESTORE_RESTART === 'true') setTimeout(() => process.exit(0), 1000).unref();
        return json(response, 202, { ok: true, accepted: true, sha256: actualHash, restoreOnRestart: true });
      }

      if (url.pathname === '/api/team/telegram' && request.method === 'POST') {
        if (!config.databaseSyncToken || !databaseSyncAuthorized(request)) return json(response, 403, { ok: false, error: 'unauthorized' });
        const input = await readBody(request);
        const sender = String(input.sender || 'telegram').slice(0, 80);
        const text = String(input.text || '').slice(0, 20000);
        const messageId = Number(input.messageId || 0);
        if (!text || !messageId) return json(response, 400, { ok: false, error: 'text and messageId required' });
        const exists = db.prepare("SELECT id FROM messages WHERE thread='telegram-relay' AND sender=? AND body=? LIMIT 1").get(sender, text);
        if (exists) return json(response, 200, { ok: true, duplicated: true });
        const result = db.prepare("INSERT INTO messages(thread,sender,recipient,body) VALUES ('telegram-relay',?,'team',?)").run(sender, text);
        db.prepare('INSERT INTO notifications(kind,title,body) VALUES (?,?,?)').run('telegram_message', 'رسالة Telegram موجهة إلى الواجهة', text.slice(0, 800));
        teamEvents.emit('message', { type: 'telegram', messageId: Number(result.lastInsertRowid) });
        teamEvents.emit('notification', { type: 'telegram_message' });
        return json(response, 201, { ok: true, id: Number(result.lastInsertRowid) });
      }

      // ── AUTH CHECK: only for non-public, non-GET-public routes ──
      const isPublicGet = request.method === 'GET' && (
        PUBLIC_GET_PATHS.has(url.pathname) ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/uploads/')
      );
      const isTeamMessagePost = url.pathname === '/api/team/messages' && request.method === 'POST';
      const localReport = url.pathname === '/report' && isLoopback(request);

      if (!isPublicGet && !isTeamMessagePost && !localReport && !authorized(request, url)) {
        return json(response, 401, { error: 'team key required' });
      }

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
        try { finalReport = await fs.readFile(path.join(config.root, 'data', 'final-report.txt'), 'utf8'); } catch {}
        return json(response, 200, {
          generatedAt: new Date().toISOString(),
          status: Object.values(health).every(Boolean) ? 'running' : 'degraded',
          health,
          services: {
            platform: true, gateway: health.gateway, ai: health.ai,
            database: health.memory && health.disk, internet: health.internet,
            telegram: Boolean(config.telegramToken), telegramMode: telegramMode(),
            dework: config.deworkToken ? 'live' : 'simulation',
            titan: config.titanUrl ? 'live' : 'simulation',
            emailQueue: mailQueueStats(),
            tunnel: { provider: 'pinggy', url: tunnel.url || '', updatedAt: tunnel.updatedAt || '' },
            renderBackup: config.backupUrl,
            koyeb: { bundleReady: true, live: false }
          },
          agents: dashboard.agents, projects: dashboard.projects, finance: dashboard.finance,
          links: { ...dashboard.links, backup: config.backupUrl, report: `http://127.0.0.1:${config.port}/report` },
          dailyReport: dailyReport(), finalReport
        });
      }

      if (url.pathname === '/agents/activate' && request.method === 'POST') return json(response, 200, { activation: await activateTeam() });

      if (url.pathname === '/api/dashboard') {
        const data = await dashboardData();
        data.performance = performancePlan();
        if (config.publicBaseUrl) data.links.public = `${config.publicBaseUrl}/?key=${encodeURIComponent(config.teamUiToken)}`;
        return json(response, 200, data);
      }

      if (url.pathname === '/api/team/agents') return json(response, 200, { agents: (await dashboardData()).agents });

      if (url.pathname === '/api/team/tasks') {
        const tasks = db.prepare(`SELECT id, source, title, status, reward, currency, assigned_agent AS assignedAgent, fit_score AS fitScore, updated_at AS updatedAt FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 100`).all();
        return json(response, 200, { tasks });
      }

      if (url.pathname === '/api/team/messages' && request.method === 'GET') {
        return json(response, 200, { messages: listMessages(url.searchParams.get('limit')) });
      }

      // ⬇️ جديد: endpoint السجل الدائم من Turso
      if (url.pathname === '/api/team/history' && request.method === 'GET') {
        try {
          const limit = Number(url.searchParams.get('limit') || 100);
          const offset = Number(url.searchParams.get('offset') || 0);
          const q = url.searchParams.get('q') || '';
          const result = await listAllMessages(limit, offset, q);
          return json(response, 200, {
            ok: true,
            messages: result.messages || [],
            hasMore: result.hasMore || false,
            query: q,
            offset
          });
        } catch (e) {
          return json(response, 500, { ok: false, error: e.message });
        }
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
        const rows = db.prepare(`SELECT id,kind,title,body,read,created_at AS createdAt FROM notifications ORDER BY id DESC LIMIT 100`).all();
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

      if (url.pathname === '/research/weekly' && request.method === 'POST') return json(response, 200, { report: await runWeeklyResearch() });

      if (url.pathname === '/emergency' && request.method === 'POST') {
        const body = await readBody(request);
        const message = body.message || 'Emergency activation requested.';
        recordError('emergency', 'EMERGENCY_REQUEST', message, body, 'Activate backup and notify operator');
        audit('aurora', 'emergency_request', { message });
        const telegramResult = await sendMessage(`🚨 Aurora emergency request\n${message}`);
        const mailResult = await sendMail({ to: config.officialEmail, subject: 'Aurora emergency activation', text: `${message}\n\nDashboard: http://127.0.0.1:${config.port}\nBackup URL: ${config.backupUrl || 'not configured'}` });
        return json(response, 202, { accepted: true, telegram: telegramResult, email: mailResult });
      }

      if (url.pathname === '/sync' && request.method === 'POST') return json(response, 200, { connectors: await runConnectors() });

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

      if (['/', '/dashboard', '/app'].includes(url.pathname)) {
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
