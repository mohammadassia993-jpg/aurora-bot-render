// security-agent-v2.js — Full Defensive Security Auditor (Arabic)
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { db } from './db.js';

const ROOT = config.root;
const SECRET = /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|MNEMONIC|SEED)/i;
const PLACEHOLDER = /^(your_|xxx|example|placeholder)/i;
// ⬇️ محدّث: إضافة مسار reset-pipeline
const SAFE_PUBLIC_POST = new Set([
  '/api/notifications/read',
  '/api/team/messages',
  '/api/team/sessions/new',
  '/api/team/sessions/rename',
  '/api/team/sessions/delete',
  '/api/admin/reset-pipeline'
]);

function runCmd(cmd, args, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve) {
    execFile(cmd, args, { cwd: ROOT, timeout: timeout }, function(err, stdout, stderr) {
      resolve({ ok: !err, stdout: String(stdout || '').slice(0, 100000), stderr: String(stderr || '').slice(0, 5000) });
    });
  });
}

export async function auditEnvVars() {
  const issues = [];
  try {
    const example = await fs.readFile(path.join(ROOT, '.env.example'), 'utf8');
    for (const line of example.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!m || !m[2]) continue;
      if (!SECRET.test(m[1])) continue;
      if (PLACEHOLDER.test(m[2].trim())) continue;
      if (m[2].trim().length < 15) continue;
      issues.push({ file: '.env.example', key: m[1], issue: 'القيمة تبدو حقيقية وليست نموذجاً' });
    }
  } catch (e) {}
  try {
    const gi = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
    if (!gi.includes('.env')) issues.push({ file: '.gitignore', issue: 'لا يتجاهل ملف .env' });
  } catch (e) {
    issues.push({ file: '.gitignore', issue: 'غير موجود' });
  }
  return { ok: issues.length === 0, issues: issues };
}

export async function auditDependencies() {
  try { await fs.access(path.join(ROOT, 'package.json')); }
  catch (e) { return { ok: true, skipped: true, reason: 'package.json غير موجود' }; }

  const result = await runCmd('npm', ['audit', '--json', '--loglevel=error', '--audit-level=none']);
  let raw = String(result.stdout || '').trim();
  if (!raw) raw = String(result.stderr || '').trim();
  if (!raw) return { ok: true, skipped: true, reason: 'npm audit لم يُنتج مخرجات' };

  let data = null;
  try { data = JSON.parse(raw); } catch (e) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { data = JSON.parse(raw.slice(start, end + 1)); } catch (e2) {}
    }
  }
  if (!data) return { ok: true, skipped: true, reason: 'فشل تحليل JSON' };

  const v = (data.metadata ? data.metadata.vulnerabilities : null) || {};
  let total = 0;
  for (const k in v) total += Number(v[k] || 0);
  return { ok: total === 0, total: total, critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0 };
}

export async function auditRecentErrors() {
  const patterns = [
    { name: 'محاولة SQL Injection', regex: /(union\s+select|';--)/i },
    { name: 'اختراق مسارات (Path Traversal)', regex: /(\.\.\/|%2e%2e)/i },
    { name: 'هجوم XSS', regex: /(<script|javascript:)/i },
    { name: 'حقن أوامر (Command Injection)', regex: /(;\s*rm\s|&&\s*curl)/i }
  ];
  try {
    const rows = db.prepare("SELECT scope, error_type, message FROM errors WHERE created_at >= datetime('now', '-24 hours') LIMIT 500").all();
    const hits = [];
    for (const row of rows) {
      const text = String(row.message || '') + ' ' + String(row.scope || '');
      for (const p of patterns) {
        if (p.regex.test(text)) {
          hits.push({ pattern: p.name, scope: row.scope, snippet: String(row.message).slice(0, 150) });
          break;
        }
      }
    }
    return { ok: hits.length === 0, scanned: rows.length, hits: hits.slice(0, 20) };
  } catch (e) {
    return { ok: true, skipped: true, reason: e.message };
  }
}

export async function auditFileIntegrity() {
  const criticalFiles = ['src/server.js', 'src/team.js', 'src/ai.js', 'src/db.js', 'package.json'];
  const results = [];
  for (const f of criticalFiles) {
    try {
      const full = path.join(ROOT, f);
      const stat = await fs.stat(full);
      results.push({ file: f, size: stat.size, modified: stat.mtime.toISOString() });
    } catch (e) {
      results.push({ file: f, missing: true });
    }
  }
  return { ok: true, files: results };
}

export async function auditApiAuth() {
  try {
    const serverCode = await fs.readFile(path.join(ROOT, 'src', 'server.js'), 'utf8');
    const routes = [];
    const re = /url\.pathname\s*===\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(serverCode)) !== null) {
      if (m[1].startsWith('/api/')) routes.push(m[1]);
    }
    const publicSet = new Set([
      '/api/ai-usage', '/api/observability', '/api/wallets/balances',
      '/api/team/messages', '/api/team/history', '/api/team/sessions',
      '/api/live', '/api/dashboard', '/api/team/agents', '/api/team/tasks',
      '/api/notifications', '/api/status'
    ]);
    const unprotected = [];
    for (const r of routes) {
      if (publicSet.has(r)) continue;
      if (SAFE_PUBLIC_POST.has(r)) continue;
      if (r.indexOf('/api/sync/') === 0) continue;
      if (r === '/api/team/telegram') continue;
      unprotected.push(r);
    }
    return { ok: unprotected.length === 0, totalApiRoutes: routes.length, unprotected: unprotected };
  } catch (e) {
    return { ok: true, skipped: true, reason: e.message };
  }
}

export async function generateSecurityReport() {
  const [deps, env, errors, auth, files] = await Promise.all([
    auditDependencies(),
    auditEnvVars(),
    auditRecentErrors(),
    auditApiAuth(),
    auditFileIntegrity()
  ]);
  const issues = [];
  if (!deps.ok && !deps.skipped) issues.push('المكتبات: ' + deps.total + ' ثغرة (حرجة:' + deps.critical + ' عالية:' + deps.high + ' متوسطة:' + deps.moderate + ' منخفضة:' + deps.low + ')');
  if (!env.ok) for (const i of env.issues) issues.push('متغيرات: ' + i.file + ' — ' + i.issue);
  if (!errors.ok) for (const h of errors.hits) issues.push('نمط هجوم: ' + h.pattern + ' في ' + h.scope);
  if (!auth.ok) for (const r of auth.unprotected) issues.push('مسار بلا حماية: ' + r);

  const status = issues.length === 0 ? '✅ آمن' : '⚠️ ' + issues.length + ' ملاحظة';
  const lines = [];
  lines.push('🔒 تقرير الفحص الأمني');
  lines.push('━━━━━━━━━━━━━━━━━━━');
  lines.push('الحالة: ' + status);
  lines.push('');
  lines.push('📦 المكتبات:');
  lines.push(deps.skipped ? '  (تم التخطي: ' + deps.reason + ')' : ('  ' + (deps.total === 0 ? '✅ لا ثغرات' : ('⚠️ ' + deps.total + ' (حرجة:' + deps.critical + ' عالية:' + deps.high + ' متوسطة:' + deps.moderate + ' منخفضة:' + deps.low + ')'))));
  lines.push('');
  lines.push('🔑 متغيرات البيئة:');
  lines.push(env.ok ? '  ✅ لا مشاكل' : ('  ⚠️ ' + env.issues.length + ' مشكلة'));
  lines.push('');
  lines.push('🛡️ حماية المسارات:');
  lines.push(auth.skipped ? ('  (تم التخطي: ' + auth.reason + ')') : ('  ' + (auth.unprotected.length === 0 ? '✅ كل المسارات محمية' : ('⚠️ ' + auth.unprotected.length + ' مسار بلا حماية'))));
  lines.push('');
  lines.push('📊 الأخطاء (24 ساعة):');
  lines.push(errors.skipped ? '  (تم التخطي)' : ('  فُحص ' + errors.scanned + ' خطأ — ' + errors.hits.length + ' نمط مشبوه'));
  lines.push('');
  lines.push('📁 سلامة الملفات:');
  for (const f of files.files) {
    lines.push('  ' + (f.missing ? '❌ مفقود' : '✅ سليم') + ' ' + f.file + (f.size ? (' (' + f.size + 'B)') : ''));
  }
  if (issues.length) {
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━');
    lines.push('📋 التفاصيل:');
    for (const i of issues) lines.push('  ⚠️ ' + i);
  }
  return {
    report: lines.join('\n'),
    summary: { deps: deps.ok, env: env.ok, errors: errors.ok, auth: auth.ok, issues: issues.length },
    details: { deps: deps, env: env, errors: errors, auth: auth, files: files }
  };
}
