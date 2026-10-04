// security-agent.js — Defensive Security Auditor
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { db } from './db.js';
import { info, warn } from './logger.js';

const ROOT = config.root;
const SAFE_AUDIT_TIMEOUT = 30000;

function runCmd(cmd, args, timeout = SAFE_AUDIT_TIMEOUT) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || '').slice(0, 8000), stderr: String(stderr || '').slice(0, 2000), err: err ? err.message : '' });
    });
  });
}

export async function auditDependencies() {
  const pkgPath = path.join(ROOT, 'package.json');
  try { await fs.access(pkgPath); } catch { return { ok: true, skipped: true, reason: 'package.json not found' }; }
  const result = await runCmd('npm', ['audit', '--json', '--audit-level=moderate']);
  let data = null;
  try { data = JSON.parse(result.stdout); } catch {}
  if (!data) return { ok: true, skipped: true, reason: 'npm audit output unparseable' };
  const vulns = data.metadata?.vulnerabilities || {};
  const total = Object.values(vulns).reduce((a, b) => a + Number(b || 0), 0);
  return { ok: total === 0, total, critical: vulns.critical || 0, high: vulns.high || 0, moderate: vulns.moderate || 0, low: vulns.low || 0 };
}

const SECRET_KEY_PATTERN = /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|MNEMONIC|SEED)/i;
export async function auditEnvVars() {
  const issues = [];
  try {
    const example = await fs.readFile(path.join(ROOT, '.env.example'), 'utf8');
    for (const line of example.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!m || !m[2] || m[2].length < 8) continue;
      const key = m[1];
      const value = m[2].trim();
      if (!SECRET_KEY_PATTERN.test(key)) continue;
      const isPlaceholder = /^(your_|xxx|example|placeholder|<|>|\$)/i.test(value) || value.length < 15;
      if (!isPlaceholder) issues.push({ file: '.env.example', key, issue: 'value looks real' });
    }
  } catch {}
  try {
    const gi = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
    if (!gi.includes('.env')) issues.push({ file: '.gitignore', issue: 'does not ignore .env' });
  } catch {
    issues.push({ file: '.gitignore', issue: 'missing' });
  }
  return { ok: issues.length === 0, issues };
}

export async function auditRecentErrors() {
  const patterns = [
    { name: 'SQL injection attempt', regex: /(union\s+select|';--|\bor\s+1\s*=\s*1)/i },
    { name: 'Path traversal', regex: /(\.\.\/|\.\.\\|%2e%2e)/i },
    { name: 'XSS attempt', regex: /(<script|javascript:|onerror\s*=)/i },
    { name: 'Command injection', regex: /(;\s*rm\s|&&\s*curl|\|\s*nc\s)/i },
    { name: 'Brute force / rate abuse', regex: /(rate.?limit|too many requests|429)/i }
  ];
  try {
    const rows = db.prepare(`SELECT scope, error_type, message, created_at FROM errors WHERE created_at >= datetime('now', '-24 hours') ORDER BY id DESC LIMIT 500`).all();
    const hits = [];
    for (const row of rows) {
      const text = String(row.message || '') + ' ' + String(row.scope || '');
      for (const p of patterns) {
        if (p.regex.test(text)) {
          hits.push({ pattern: p.name, scope: row.scope, error_type: row.error_type, snippet: String(row.message).slice(0, 150), at: row.created_at });
          break;
        }
      }
    }
    return { ok: hits.length === 0, scanned: rows.length, hits: hits.slice(0, 20) };
  } catch (e) { return { ok: true, skipped: true, reason: e.message }; }
}

export async function auditApiAuth() {
  try {
    const serverCode = await fs.readFile(path.join(ROOT, 'src', 'server.js'), 'utf8');
    const issues = [];
    const routes = [...serverCode.matchAll(/url\.pathname\s*===\s*'([^']+)'/g)].map(m => m[1]);
    const apiRoutes = routes.filter(r => r.startsWith('/api/'));
    const unprotected = [];
    for (const r of apiRoutes) {
      const idx = serverCode.indexOf(`'${r}'`);
      if (idx === -1) continue;
      const after = serverCode.slice(idx, idx + 800);
      const hasAuthCheck = /authorized\(|databaseSyncAuthorized\(|PUBLIC_GET_PATHS|secret\s*!==|x-telegram-bot-api-secret-token/.test(after);
      if (!hasAuthCheck) unprotected.push(r);
    }
    return { ok: unprotected.length === 0, totalApiRoutes: apiRoutes.length, unprotected };
  } catch (e) { return { ok: true, skipped: true, reason: e.message }; }
}

export async function auditFileIntegrity() {
  const criticalFiles = ['src/server.js', 'src/team.js', 'src/ai.js', 'src/db.js', 'package.json'];
  const results = [];
  for (const f of criticalFiles) {
    try {
      const full = path.join(ROOT, f);
      const stat = await fs.stat(full);
      results.push({ file: f, size: stat.size, modified: stat.mtime.toISOString() });
    } catch {
      results.push({ file: f, missing: true });
    }
  }
  return { ok: true, files: results };
}

export function auditProcessEnv() {
  const sensitiveKeys = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'PASS', 'API'];
  const exposed = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    if (sensitiveKeys.some(s => k.toUpperCase().includes(s))) exposed.push({ key: k, length: v.length });
  }
  return { ok: true, count: exposed.length, keys: exposed.map(e => e.key) };
}

export async function generateSecurityReport() {
  info('security', 'Starting defensive security audit...');
  const [deps, env, errors, auth, files, procEnv] = await Promise.all([
    auditDependencies(), auditEnvVars(), auditRecentErrors(), auditApiAuth(), auditFileIntegrity(), Promise.resolve(auditProcessEnv())
  ]);
  const issues = [];
  if (!deps.ok && !deps.skipped) issues.push(`WARNING: ${deps.total} vulnerabilities in dependencies (${deps.critical} critical, ${deps.high} high)`);
  if (!env.ok) for (const i of env.issues) issues.push(`Env: ${i.file} — ${i.issue}`);
  if (!errors.ok) for (const h of errors.hits) issues.push(`ATTACK PATTERN: ${h.pattern} in ${h.scope}`);
  if (!auth.ok) for (const r of auth.unprotected) issues.push(`Unprotected route: ${r}`);
  const status = issues.length === 0 ? 'SAFE' : `${issues.length} note(s)`;
  const lines = [
    'Security Audit Report',
    '=====================',
    `Status: ${status}`,
    '',
    'Dependencies:',
    deps.skipped ? `  (skipped: ${deps.reason})` : `  ${deps.total === 0 ? 'OK - no vulnerabilities' : `${deps.total} (C:${deps.critical} H:${deps.high} M:${deps.moderate} L:${deps.low})`}`,
    '',
    'Env Vars:',
    env.ok ? '  OK' : `  ${env.issues.length} issue(s)`,
    '',
    'API Auth:',
    auth.skipped ? `  (skipped: ${auth.reason})` : `  ${auth.unprotected.length === 0 ? 'OK - all routes protected' : `${auth.unprotected.length} unprotected`}`,
    '',
    'Errors (24h):',
    errors.skipped ? '  (skipped)' : `  scanned ${errors.scanned} — ${errors.hits.length} suspicious`,
    '',
    'File Integrity:',
    ...files.files.map(f => `  ${f.missing ? 'MISSING' : 'OK'} ${f.file}${f.size ? ` (${f.size}B)` : ''}`)
  ];
  if (issues.length) {
    lines.push('', '=====================', 'Issues:', ...issues.map(i => '  ' + i));
  }
  info('security', `Audit complete: ${issues.length} issues`);
  return {
    report: lines.join('\n'),
    summary: { deps: deps.ok, env: env.ok, errors: errors.ok, auth: auth.ok, issues: issues.length },
    details: { deps, env, errors, auth, files, procEnv }
  };
}
